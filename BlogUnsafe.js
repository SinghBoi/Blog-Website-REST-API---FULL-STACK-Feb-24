import express from "express";
import session from "express-session";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import bcrypt from 'bcryptjs';
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import helmet from "helmet";
import moment from "moment/moment.js";

const app = express();

// Connect to Redis
const redisClient = createClient();
redisClient.connect();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cookieParser());

app.use(express.static(path.join(__dirname)));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/Public/views"));

const crypton = crypto.randomBytes(16).toString("base64");

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", `"crypton-${crypton}"`],
                upgradeInsecureRequests: null
            },
        },
    })
);

// Manage sessions via Redis
app.use(
    session({
        redisStore: new RedisStore({ client: redisClient }),
        secret: "myUnsafeSecret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1800000,      // 30 minuter 
            sameSite: "strict",   // CSRF protection - Only sent with requests from the same page
            httpOnly: true,       // protection against XSS - If an attacker injects malicious scripts into a web page, those scripts will not be able to access the session cookie
            signed: true,         // Protects against manipulation of cookie data during transmission
        },
    })
);

//Authentication
function authenticate(req, res, next) {
    if (req.session.isLoggedIn) {
        return next();
    } else {
        return res.status(403).send("Forbidden: You are not authorized.");
    }
};

// csrf-token
function verifyCsrfToken(req, res, next) {
    if (req.session.csrfToken === req.body._csrf) {
        next();
    } else {
        res.send("Invalid CSRF-token");
    }
}

// Oauth 2.0
app.get("/auth/github", (req, res) => {
    const authURL = "https://github.com/login/oauth/authorize?client_id=89f264fccccb387e4ceb"
    res.redirect(authURL)
})

// Oauth Callback
app.get("/auth/github/callback", async (req, res) => {
    const code = req.query.code;
    try {
        const response = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            body: new URLSearchParams({
                client_id: "89f264fccccb387e4ceb",
                client_secret: "b6b482ff56d215fff6815b97a547e7674d9be8b5",
                code: code,
            }),
            headers: {
                Accept: "application/json",
            },
        });

        const jsonResponse = await response.json();
        const userinfo = await getUserInfoFromGitHub(jsonResponse.access_token);

        const csrfToken = crypto.randomBytes(64).toString("hex"); //A long random string.
        req.session.csrfToken = csrfToken; //The token is tied to the current session.
        req.session.isLoggedIn = true;
        req.session.username = userinfo.login;

        const userExists = await redisClient.exists(`user:${req.session.username}`);

        if (!userExists) {
            await redisClient.hSet(`user:${req.session.username}`, "role", "user");
        }
        res.redirect("/Main");
    } catch (error) {
        console.error("Error during GitHub callback:", error);
        res.status(500).send("Internal Server Error");
    }
});

const getUserInfoFromGitHub = async (access_token) => {
    const response = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });
    return await response.json();
};

app.get("/", (req, res) => {
    const filePath = path.join(__dirname, "public", "index.html");
    res.sendFile(filePath);
});

// Login route
app.get("/", (req, res) => {
    if (req.session.authenticated) {
        res.redirect("/Main");
    } else {
        const filePath = path.join(__dirname, "public", "index.html");
        res.sendFile(filePath);
    }
});

function validatePassword(password) {
    const char = /[!@#$%^&*()_+={}\[\];:'"<>,.?/]/;
    const num = /\d/;
    const length = 8;

    return password.length >= 8 && char.test(password) && num.test(password);
}

// Log in a user
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!(await redisClient.exists(`user:${username}`))) {
            return res.status(401).send("No Such Username Exists");
        }

        const dbPassword = await redisClient.hGet(`user:${username}`, "password");
        if (!bcrypt.compare(password, dbPassword)) {
            // Invalid credentials
            return res.status(401).send("Invalid Credentials");
        }

        const csrfToken = crypto.randomBytes(64).toString("hex"); // A long random string.
        req.session.csrfToken = csrfToken; // The token is tied to the current session.
        req.session.username = username;
        req.session.isLoggedIn = true;

        res.redirect("/Main");
    } catch (err) {
        console.error(err, "error during login");
        res.status(500).send("Internal Server Error");
    }
});

// Register a new user
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    if (await redisClient.exists(`user:${username}`)) {
        return res.status(401).send("Username Already Exists");
    }

    if (!validatePassword(password)) {
        return res.status(401).send(
            "Password length must be at least 8 characters, contain one numeric character and one special character"
        );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await redisClient.hSet(`user:${username}`, "password", hashedPassword);
    await redisClient.hSet(`user:${username}`, "role", "user");

    res.status(200).send("Registered Successfully");
});

app.get("/Main", authenticate, async (req, res) => {
    await redisClient.hGet(`user:${req.session.username}`, "role");
    try {
        const blogPosts = await getAllBlogPosts();
        res.render("Main",
            { username: req.session.username, blogPosts, csrfToken: req.session.csrfToken, crypton });
    } catch (error) {
        console.error("Error retrieving blog posts:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Fetch All Blog Posts
let blogPosts = [];

const getAllBlogPosts = async () => {
    const postIds = await redisClient.keys("blogpost:*");
    const blogPosts = await Promise.all(
        postIds.map(async (postId) => {
            const postData = await redisClient.hGetAll(postId);
            postData.comments = await getAllComments(postId.split(':')[1]);
            return { postId: postId.split(':')[1], ...postData };
        })
    );
    blogPosts.sort((a, b) => b.postId - a.postId)
    return blogPosts;
};

// With the XSS protections removed, you can send e.g.
// <script>alert("XSS Attack!");</script> via a Post Creation.

// Create Post
app.post("/Main/create", verifyCsrfToken, authenticate, async (req, res) => {
    try {
        const { title, content } = req.body;

        const username = req.session.username;
        const postId = await redisClient.incr("nextPostId");
        const newPost = {
            postId,
            title,
            content,
            author: username,
            created: moment(new Date()).format("YYYY-MM-DD HH:mm"),
        };

        await redisClient.hSet(`blogpost:${postId}`, newPost);
        blogPosts = await getAllBlogPosts();
        res.redirect("/Main")
    } catch (error) {
        console.error("Error adding blog post to Redis:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Fetch All Comments
const getAllComments = async (postId) => {
    const commentIds = await redisClient.keys(`comment:${postId}:*`);
    const comments = await Promise.all(
        commentIds.map(async (commentId) => {
            const commentData = await redisClient.hGetAll(commentId);
            return { commentId: commentId.split(':')[2], ...commentData };
        })
    );
    comments.sort((a, b) => b.commentId - a.commentId);
    return comments;
};

// With the XSS protections removed, you can send e.g.
// <script>alert("XSS Attack!");</script> via a comment.

// Add a comment to a blog post
app.post("/Main/comment/:postId", verifyCsrfToken, authenticate, async (req, res) => {
    try {
        const postId = req.params.postId;
        const { content } = req.body;
        const username = req.session.username;
        const commentId = await redisClient.incr("nextCommentId");

        if (!content || content.trim() === '') {
            return res.status(400).json({ error: "Bad request." });
        }

        const newComment = {
            commentId,
            content,
            author: username,
            created: moment(new Date()).format("YYYY-MM-DD HH:mm"),
        }

        // Update the Comments in the Post
        await redisClient.hSet(`comment:${postId}:${commentId}`, newComment);
        const post = await redisClient.hGetAll(`blogpost:${postId}`);
        post.comments = await getAllComments(postId);
        res.redirect("/Main");
    } catch (error) {
        console.error("Error adding comment to Redis:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Delete a blog post along with its comments
app.post("/Main/delete/:postId", authenticate, async (req, res) => {
    try {
        const postId = req.params.postId;
        const username = req.session.username;
        const role = await redisClient.hGet(`user:${username}`, "role");
        const blogPostOwner = await redisClient.hGet(`blogpost:${postId}`, "author");

        if (blogPostOwner !== username && role !== "admin") {
            console.log(blogPostOwner, username)
            return res.status(403).send(
                "Forbidden: You are not the owner of this blog post and therefore cannot delete the post");
        }
        await redisClient.del(`blogpost:${postId}`);
        console.log("deleted")
        blogPosts = await getAllBlogPosts();
        res.redirect("/Main")
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Logout
app.post("/logout", (req, res) => {
    console.log("Logged Out Successfully")
    req.session.destroy()
    res.redirect('/');
});

app.listen(9000, () => {
    console.log("Server is Running on port: 9000 ");
});

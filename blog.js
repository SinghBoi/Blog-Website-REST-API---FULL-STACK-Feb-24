import express from "express";
import jwt from "jsonwebtoken";
import bodyParser from "body-parser";
import { createClient } from "redis";
import RedisStore from "connect-redis";
import cookieParser from "cookie-parser";
import { compareSync, hashSync } from "bcrypt";

const app = express();

// Connect to Redis
const redisClient = createClient();
redisClient.connect();

// Manage sessions via Redis
const redisStore = new RedisStore({ client: redisClient, prefix: "session:" });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// Check if the user is logged in
app.use("/protected", (req, res, next) => {
    const token = req.cookies.token;

    try {
        const payload = jwt.verify(token, "secret");
        if (payload.canViewProtectedPage) {
            next();
        } else {
            res.status(401).send("Not permitted.");
        }
    } catch (err) {
        res.json(err);
    }
});

// Log in a user
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!(await redisClient.exists(`user:${username}`))) {
            return res.status(401).send("No Such Username Exists");
        }

        const dbPassword = await redisClient.get(`user:${username}`);
        if (!compareSync(password, dbPassword)) {
            // Invalid credentials
            return res.status(401).send("Invalid Credentials");
        }

        const token = jwt.sign(
            { username: username, canViewProtectedPage: true },
            "secret",
            { expiresIn: 1000 * 60 * 10 }
        );
        res.cookie("token", token);

        // Successful login, send a success message
        res.status(200).send("Login Successful");
    } catch (err) {
        console.error(err);
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
        return res
            .status(401)
            .send(
                "Password length must be at least 8 characters, contain one numeric character and one special character"
            );
    }

    const hashedPassword = hashSync(password, 10);
    await redisClient.set(`user:${username}`, hashedPassword);

    res.status(200).send("Registered Successfully");
});

function validatePassword(password) {
    const char = /[!@#$%^&*()_+={}\[\];:'"<>,.?/]/;
    const num = /\d/;
    const length = 8;

    return password.length >= 8 && char.test(password) && num.test(password);
}

app.get("/getLoggedInUser", (req, res) => {
    const token = req.cookies.token;
    const username = jwt.verify(token, "secret").username;

    res.json({ username });
});

app.get("/getBlogPosts", async (req, res) => {
    try {
        // Assuming you store blog posts as JSON objects in a list named 'blogPosts'
        const blogPosts = await redisClient.lRange("blogPosts", 0, -1);
        const parsedBlogPosts = blogPosts.map((post) => JSON.parse(post));

        res.json(parsedBlogPosts);
    } catch (error) {
        console.error("Error fetching blog posts from Redis:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/create", async (req, res) => {
    const { title, content } = req.body;
    const userName = jwt.verify(req.cookies.token, "secret").username;

    const postId = await redisClient.incr("nextPostId");

    try {
        const newPost = {
            id: postId.toString(),
            title,
            content,
            author: userName,
            timestamp: new Date().toISOString(),
            comments: [],
        };

        await redisClient.rPush("blogPosts", JSON.stringify(newPost));

        // Fetch the updated blog posts and send them as a response
        const updatedBlogPosts = await redisClient.lRange("blogPosts", 0, -1);
        const parsedBlogPosts = updatedBlogPosts.map((post) => JSON.parse(post));

        res.json(parsedBlogPosts);
    } catch (error) {
        console.error("Error adding blog post to Redis:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Add a comment to a blog post
app.post("/comment", async (req, res) => {
    const { postId, commentContent } = req.body;
    const userName = jwt.verify(req.cookies.token, "secret").username;

    try {
        const blogPosts = await redisClient.lRange("blogPosts", 0, -1);
        const postIndex = blogPosts.findIndex((p) => JSON.parse(p).id === postId);
        const post = JSON.parse(blogPosts.find((p) => JSON.parse(p).id === postId));

        if (post) {
            const commentId = await redisClient.incr("nextCommentId");
            const newComment = {
                id: commentId.toString(),
                author: userName,
                content: commentContent,
                timestamp: new Date().toISOString(),
            };

            post?.comments?.push(newComment);

            // Update the blog post in the list
            await redisClient.lSet("blogPosts", postIndex, JSON.stringify(post));

            res.redirect("/protected");
        } else {
            // res.status(400).send("Invalid post ID");
        }
    } catch (error) {
        console.error("Error adding comment to Redis:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Serve static files
app.use(express.static("Public"));

app.listen(9000, () => {
    console.log("Server is Running");
});

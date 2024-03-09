import express from "express";
import jwt from "jsonwebtoken";
import bodyParser from "body-parser";
import { createClient } from "redis";
import session from "express-session";
import RedisStore from "connect-redis";
import cookieParser from "cookie-parser";
import { compareSync, hashSync } from "bcrypt";


const app = express();
//Connect to Redis
const redisClient = createClient();
redisClient.connect();

// Lets manage session via Redis
const redisStore = new RedisStore({ client: redisClient, prefix: "session:" });

// middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Då den här ligger före app.use(express.static("public"))
// så körs den här först. ORDNINGEN ÄR VIKTIG!
// Om användaren är inloggad kör vi vidare användaren via next()
// Annars skickar vi "not permitted"
app.get("/protected", (req, res, next) => {
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

// Implementation 2 - Ett lösenord från databasen.
// Nu kan vi ha flera användare.
// Vi har dock fortfarande sårbarheten att om databasen läcker
// har användaren tillgång till alla lösenord. Undrar hur man löser det? 
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!await redisClient.exists(`user:${username}`)) {
            return res.status(401).send("No Such Username Exists");
        }
        const dbPassword = await redisClient.get(`user:${username}`);
        if (!compareSync(password, dbPassword)) {
            res.status(401).send("Invalid Credentials");
        }
        const token = jwt.sign({
            username: username, canViewProtectedPage: true
        }, "secret", { expiresIn: 1000 * 60 * 10 })
        res.cookie("token", token);

        res.redirect("./Protected")

    } catch (err) {
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    if (await redisClient.exists(`user:${username}`)) {
        return res.status(401).send("Username Already Exists");
    }
    if (!validatePassword(password)) {
        return res.send("Password length must be atleast 8 characters,\
        contain one numeric character and one special character");
    }
    const hashedPassword = hashSync(password, 10);
    await redisClient.set(`user:${username}`, hashedPassword);
    res.send("Registered Successfully");
});

function validatePassword(password) {
    const char = /[!@#$%^&*()_+={}\[\];:'"<>,.?/]/;
    const num = /\d/;
    const length = 8;

    return password.length >= 8 && char.test(password) && num.test(password);
}

app.post("/create", async (req, res) => {
    const { title, content } = req.body;
    const userName = jwt.verify(req.cookies.token, "secret").username;

    try {
        // Assuming you store blog posts as JSON objects in a list named 'blogPosts'
        const newPost = {
            title,
            content,
            author: userName,
            timestamp: new Date(),
        };
        await redisClient.rPush("blogPosts", JSON.stringify(newPost));

        // Redirect to the main page after adding the blog post
        res.redirect("./Protected");
    } catch (error) {
        console.error("Error adding blog post to Redis:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Den här ska ligga sist. Då körs alla funktioner i respektive get först.
app.use(express.static("Public"));

app.listen(9000, () => {
    console.log("Server is Running");
});
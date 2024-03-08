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
            return res.json({ status: "error", message: "No Such Username Exists" });
        }
        const dbPassword = await redisClient.get(`user:${username}`);
        if (!compareSync(password, dbPassword)) {
            res.json({ status: "error", message: "Invalid Credentials" });
        }
        const token = jwt.sign({
            username: username, canViewProtectedPage: true
        }, "secret", { expiresIn: 1000 * 60 * 10 })
        res.cookie("token", token);

        const redirectUrl = "./Protected"
        //res.json({ status: "success", message: `Welcome ${username}!`, redirect: redirectUrl });
        res.redirect(redirectUrl)

    } catch (err) {
        console.log(err);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    if (await redisClient.exists(`user:${username}`)) {
        return res.json({ status: "error", message: "Username Already Exists" });
    }
    if (!validatePassword(password)) {
        return res.json({
            status: "error", message: "Password length must be atleast 8 characters,\
        contain one numeric character and one special character" });
    }
    const hashedPassword = hashSync(password, 10);
    await redisClient.set(`user:${username}`, hashedPassword);
    res.json({ status: "success", message: "Registered Successfully" });
});

function validatePassword(password) {
    const char = /[!@#$%^&*()_+={}\[\];:'"<>,.?/]/;
    const num = /\d/;
    const length = 8;

    return password.length >= 8 && char.test(password) && num.test(password);
}

// Den här ska ligga sist. Då körs alla funktioner i respektive get först.
app.use(express.static("Public"));

app.listen(9000, () => {
    console.log("Server is Running");
});
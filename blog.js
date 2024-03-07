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


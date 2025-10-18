// import mongoose from "mongoose";
import connectDB from "./database/index.js";
import dotenv from "dotenv";

dotenv.config({
    path: './env'
})


connectDB();
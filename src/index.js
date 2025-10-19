import connectDB from "./database/index.js";
import dotenv from "dotenv";
import app from "./app.js";

dotenv.config({
    path: './env'
})


connectDB()
.then(() => {

    const server = app.listen(process.env.PORT || 8000, () => {
        console.log(`Server is running at port: ${process.env.PORT}`)
    });

    server.on('error', (error) => {
        console.log(`ERROR: ${error}`);
        throw error
    });
})
.catch((error) => {
    console.log('MONGO db connection failed!', error);
    
});
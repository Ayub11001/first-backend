import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/apiErrors.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";


const registerUser = asyncHandler( async (req, res) => {
    const {fullName, email, username, password} = req.body;
    console.log(`email: ${email}\nfull name: ${fullName}\nusername: ${username}\npassword: ${password}\n`);


    // validation of fields
    if(
        [fullName, email, username, password]
        .some((field) => field?.trim() === '' )
    ) {
        throw new ApiError(400, "All the fields are required")
    }


    // checking if the user already exists
    const existedUser = User.findOne({
        $or: [{ username }, { email }]
    })

    if(existedUser) {
        throw new ApiError(409, "User with this email or username already exists")
    }


    // getting the local file paths to avatar and cover img and checking if avatar is empty
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.file?.coverImage[0]?.path;

    if(avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }


    // uploading avatar and cover img to cloudinary
    const avatarRes = await uploadOnCloudinary(avatarLocalPath);
    const coverImageRes = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatarRes) {
        throw new ApiError(400, "Avatar file is required")
    }

    const user = await User.create({
        fullName,
        avatar: avatarRes.url,
        coverImage: coverImageRes?.url || '',
        email,
        password,
        username: username.toLowerCase(),
    })
    
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User registered successfully"
        )
    )
    
} )

export {registerUser}
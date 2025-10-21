import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/apiErrors.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";


const generateAccessAndRefreshTokens = async function (userId) {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});

        return {accessToken, refreshToken};

    } catch (error) {
        throw new ApiError(500, 'Something went wrong while generating refresh and access tokens')   
    }
}


const registerUser = asyncHandler( async (req, res) => {
    const {fullName, email, username, password} = req.body;


    // validation of fields
    if(
        [fullName, email, username, password]
        .some((field) => field?.trim() === '' )
    ) {
        throw new ApiError(400, "All the fields are required")
    }


    // checking if the user already exists
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if(existedUser) {
        throw new ApiError(400, "User with this email or username already exists")
    }


    // getting the local file paths to avatar and cover-img and checking if avatar is empty
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;
    
    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }


    // uploading avatar and cover img to cloudinary
    const avatarRes = await uploadOnCloudinary(avatarLocalPath);
    const coverImageRes = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatarRes) {
        throw new ApiError(400, "Avatar file is required")
    }
    

    // creating a user and saving record in the db
    const user = await User.create({
        fullName,
        avatar: avatarRes.url,
        coverImage: coverImageRes?.url || '',
        email,
        password,
        username: username.toLowerCase(),
    })
    

    //finding the created user by userId in db and raising an error if the user is not found
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }


    // returning a success response
    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User registered successfully"
        )
    )
    
} )


const loginUser = asyncHandler( async (req, res) => {
    // getting credentials
    const {email, username, password} = req.body;

    if(!(username || email)) {
        throw new ApiError(400, "username or email is a required field")
    }


    // finding the user by username or email
    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user) {
        throw new ApiError(404, 'User does not exist')
    }


    // checking the password
    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid) {
        throw new ApiError(401, 'Invalid user credentials')
    }


    //generating tokens
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);


    // getting logged in user without sensitivce fields to return back with response
    const loggedInUser = await User.findById(user._id)
    .select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser,
                accessToken,
                refreshToken
            },
            'User logged in successfully'
        )
    );

} );


const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined,
            }
        },
        {
            new: true
        }
    );

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
    .status(200)
    .clearCookie('accessToken', options)
    .clearCookie('refreshToken', options)
    .json(new ApiResponse(200, {}, 'User logged out successfully'))
} );


export {
    registerUser,
    loginUser,
    logoutUser
}




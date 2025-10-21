import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/apiErrors.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from 'jsonwebtoken';


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


const refreshAccessToken = asyncHandler( async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if(!incomingRefreshToken) {
        throw new ApiError(401, 'Unauthorized request')
    }


    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user) {
            throw new ApiError(401, 'Invalid refresh token')
        }
    
        if(incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, 'Refresh token is expired or used');
        }
    
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id);
    
        return res
        .status(200)
        .cookie('accessToken', accessToken, options)
        .cookie('refreshToken', newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                'Access token refreshed'
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || 'Invalid refresh token')
    }

} );


const changeCurrentpassword = asyncHandler( async (req, res) => {
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect) {
        throw new ApiError(400, 'Invalid old password');
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: true});

    return res
    .status(200)
    .json(new ApiResponse(
        200,
        {},
        'Password Changed'
    ))

} );


const getCurrentUser = asyncHandler( async (req, res) => {
    return res
    .status(200)
    .json(
        200,
        res.user,
        'User successfully fetched'
    );
} );


const updateAccountDetails = asyncHandler( async (req, res) => {
    const {fullName, email} = req.body;

    if(!fullName || !email) {
        throw new ApiError(400, 'All fields are required')
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email,
            }
        },
        {new: true}
    )
    .select('-password');

    return res
    .status(200)
    .json(new ApiResponse(
        200,
        user,
        'Updated user credentials successfully'
    ))
} );


const updateUserAvatar = asyncHandler( async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar.url) {
        throw new ApiError(400, 'Error while uploading avatar');
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
            }
        },
        {new: true}
    )
    .select('-password');

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            'Avatar updated successfully'
        )
    );
});


const updateUserCoverImage = asyncHandler( async (req, res) => {
    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImage.url) {
        throw new ApiError(400, 'Error while uploading cover-image');
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            }
        },
        {new: true}
    )
    .select('-password');

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user,
            'Cover image updated successfully'
        )
    )
});


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentpassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}




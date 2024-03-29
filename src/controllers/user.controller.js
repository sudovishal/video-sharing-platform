import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    
    user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      `${error}-Something went wrong while generating access and refresh token`
    );
  }
};

const registerUser = asyncHandler(async (req, res, next) => {
  //  my logic before watching hitesh's solution
  // 1. taking fields required for register by req.body
  // 2. check if user already exists in the database
  // 3. password validation
  // 4. hashing the password
  // 5. save the avatar and coverimage to local server and then to cloudinary
  // 6. save the data to mongodb


  // get user details
  // validation - not empty
  // check if user already exists
  // check for images, check for avatar
  // upload them to cloudinary
  // create user object - create entry in DB
  // remove password and refresh token field from response
  // check for user creation
  // return response else error

  const { fullname, email, username, password } = req.body;
  // if( fullname === "") {
  //   throw new ApiError(400, "Full Name is required")
  // } beginner style

  if (
    [fullname, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields required!");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
    // https://www.mongodb.com/docs/manual/reference/operator/query/
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }
  // ?.  optional chaining

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken" // kya nahi chahiye
  );
  if (!createdUser) {
    throw new ApiError(500, "Somewthing went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User signed up successfully"));
});

const loginUser = asyncHandler(async (req, res, next) => {
  // req body -> data
  // username or email-based
  // // find the user
  // compare passswords in req body and db. password check
  //  create access token and refresh token
  //  send tokens in cookies

  const { email, username, password } = req.body;
  console.log(email);

  if (!username && !email) {
    throw new ApiError(400, "Username or email is required");
  }

  // An Alternative of above code based on logic discussed
  // if(!(username || email)) {
    // throw new ApiError(400,"username or email is required")
  // }

  const user = await User.findOne({ $or: [{ username }, { email }] }); // mongodb operators(and,or,not)

  if (!user) {
    throw new ApiError(400, "user does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  // user will have access to the methods defined in the User model file.
  // User is for mongodb functions like findOne

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid User Credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

  const loggedInUser = await User.findById(user._id).
  select("-password -refreshToken")

  const options = {
    httpOny: true,
    secure: true
  }

  return res.status(200)
  .cookie("accessToken", accessToken, options)
  .cookie("refreshToken", refreshToken, options)
  .json(
    new ApiResponse(
      200,
      {
        user: loggedInUser, accessToken, refreshToken
      },
      "User logged in Successfully"
    )
  )
})

const logoutUser = asyncHandler(async(req,res) => {
  await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          refreshToken: undefined
        }
      },
        {
          new: true // didnt understand
        }
  )
  const options = {
    httpOny: true,
    secure: true
  }

  return res.status(200)
  .clearCookie("accessToken", options)
  .clearCookie("refreshToken", options)
  .json(new ApiResponse(200, {}, "User logged out!"))
})

const refreshAccessToken = asyncHandler(async(req,res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken // for web and mobile app

  if(!incomingRefreshToken) {
    throw new ApiError(401, `${error}- Unauthorized Request`)
  }

  try {
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  
    const user = await User.findById(decodedToken?._id)
  
     if (!user) {
       throw new ApiError(401, `${error}- Invalid Refresh token`);
     }
  
     if(incomingRefreshToken != user?.refreshToken) {
       throw new ApiError(401, `${error}-Refresh token is expired or used`);
     }
  
     const options = {
      httpOny: true,
      secure: true
     }
  
     const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id)
  
     return res
       .status(200)
       .cookie("accessToken", accessToken, options)
       .cookie("refreshToken", newRefreshToken, options)
       .json(new ApiResponse(
                 200,
                 { accessToken, refreshToken: newRefreshToken },
                 "Access Token refreshed successfully"
                 )
        );
  } catch (error) {
    throw new ApiError(401, error?.message || `Invalid Refresh token`)
  }


})

const changeCurrentPassword = asyncHandler(async(req,res) => {
  const {oldPassword, newPassword } = req.body

   const user = await User.findById(req.user?._id)
   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

   if(!isPasswordCorrect) {
    throw new ApiError(400, "Invalid Previous Password")
   }

   user.password = newPassword

   await user.save({validateBeforeSave: false})

   return res
   .status(200)
   .json(new ApiResponse(200, {}, "Password changed successfully"))

})

const getCurrentUser = asyncHandler(async(req,res) => {
  return res
  .status(200)
  .json(new ApiResponse(200, req.user, `Current User fetched successfully`))
})

const updateAccountDetails = asyncHandler(async(req,res) => { // text-based data
  const {fullname, email} = req.body // if you wanto change any file, keep a different controller function

  if(!fullname || !email) {
    throw new ApiError(400, "All fields are required")
  }

  const user = await User.findByIdAndUpdate(req.user?._id,
    {
        $set: {
        fullname: fullname,
        email: email
      }
    },
    {new: true}).
    select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req,res) => {
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
      throw new ApiError(400, "Error while uploading on Avatar")
    }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url
      },
    },
    { new: true }
  ).select("-password");


  return res
  .status(200)
  .json(new ApiResponse(200, avatar.url, "Avatar updated successfully" ))

})

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;
  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover Image is missing");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading the Cover Image");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");

console.log(coverImage.url);
  return res
    .status(200)
    .json(new ApiResponse(200, coverImage.url, "cover image updated successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage
};

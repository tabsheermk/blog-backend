import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Post title is required"],
      trim: true,
      minlength: [5, "Title must be at least 5 characters"],
      maxlength: [200, "Title cannot exceed 200 characters"],
      index: true, // For search functionality
    },
    content: {
      type: String,
      required: [true, "Post content is required"],
      minlength: [50, "Content must be at least 50 characters"],
      maxlength: [50000, "Content cannot exceed 50,000 characters"],
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: [30, "Each tag cannot exceed 30 characters"],
        index: true,
      },
    ],
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Voting system - store counts for performance
    votes: {
      upvotes: {
        type: Number,
        default: 0,
        min: 0,
      },
      downvotes: {
        type: Number,
        default: 0,
        min: 0,
      },
      score: {
        type: Number,
        default: 0, // upvotes - downvotes
        index: true, // For sorting by popularity
      },
    },
    // Content metadata
    readTime: {
      type: Number, // in minutes
      default: 1,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    // SEO and URL
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    // Stats
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    commentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true, // createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for performance
postSchema.index({ createdAt: -1, isPublished: 1 }); // Latest published posts
postSchema.index({ "votes.score": -1, isPublished: 1 }); // Popular posts
postSchema.index({ tags: 1, isPublished: 1 }); // Posts by tags
postSchema.index({ author: 1, createdAt: -1 }); // Author's posts

// Virtual for author details (populated)
postSchema.virtual("authorDetails", {
  ref: "User",
  localField: "author",
  foreignField: "_id",
  justOne: true,
  select: "firstName lastName email avatar",
});

// Generate slug from title
postSchema.pre("save", function (next) {
  if (this.isModified("title")) {
    this.slug =
      this.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 100) +
      "-" +
      Date.now();
  }

  // Calculate read time (average 200 words per minute)
  if (this.isModified("content")) {
    const wordCount = this.content.split(/\s+/).length;
    this.readTime = Math.max(1, Math.ceil(wordCount / 200));
  }

  next();
});

// Method to update vote scores
postSchema.methods.updateVoteScore = function () {
  this.votes.score = this.votes.upvotes - this.votes.downvotes;
  return this.save();
};

const Post = mongoose.model("Post", postSchema);

export default Post;

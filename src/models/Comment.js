import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: [true, "Comment content is required"],
      trim: true,
      minlength: [1, "Comment must have content"],
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    // For nested comments
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },
    // Nested structure for replies (limited depth for performance)
    depth: {
      type: Number,
      default: 0,
      max: 3, // Limit nesting to 3 levels for performance
      index: true,
    },
    // Voting on comments
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
        default: 0,
        index: true,
      },
    },
    // Comment status
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Reply count for parent comments
    replyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient querying
commentSchema.index({ post: 1, parentComment: 1, createdAt: 1 });
commentSchema.index({ post: 1, createdAt: -1, isDeleted: 1 });
commentSchema.index({ author: 1, createdAt: -1 });

// Virtual for author details
commentSchema.virtual("authorDetails", {
  ref: "User",
  localField: "author",
  foreignField: "_id",
  justOne: true,
  select: "firstName lastName avatar",
});

// Method to update vote score
commentSchema.methods.updateVoteScore = function () {
  this.votes.score = this.votes.upvotes - this.votes.downvotes;
  return this.save();
};

const Comment = mongoose.model("Comment", commentSchema);

export default Comment;

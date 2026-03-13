import Comment from "../models/Comment.js";
import Post from "../models/Post.js";
import Vote from "../models/Vote.js";
import { validationResult } from "express-validator";

const commentController = {
  // @desc    Add comment to post
  // @route   POST /api/posts/:postId/comments
  // @access  Private
  addComment: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { postId } = req.params;
      const { content, parentCommentId } = req.body;

      // Check if post exists
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      let depth = 0;
      let parentComment = null;

      // If replying to a comment
      if (parentCommentId) {
        parentComment = await Comment.findById(parentCommentId);
        if (!parentComment) {
          return res.status(404).json({
            success: false,
            message: "Parent comment not found",
          });
        }

        depth = parentComment.depth + 1;

        // Limit nesting depth
        if (depth > 3) {
          return res.status(400).json({
            success: false,
            message: "Maximum comment nesting depth reached",
          });
        }
      }

      // Create comment
      const comment = new Comment({
        content,
        author: req.user._id,
        post: postId,
        parentComment: parentCommentId || null,
        depth,
      });

      await comment.save();
      await comment.populate("authorDetails");

      // Update counters
      await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

      if (parentComment) {
        await Comment.findByIdAndUpdate(parentCommentId, {
          $inc: { replyCount: 1 },
        });
      }

      res.status(201).json({
        success: true,
        message: "Comment added successfully",
        data: { comment },
      });
    } catch (error) {
      console.error("Add comment error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while adding comment",
      });
    }
  },

  // @desc    Get comments for a post
  // @route   GET /api/posts/:postId/comments
  // @access  Public
  getPostComments: async (req, res) => {
    try {
      const { postId } = req.params;
      const { page = 1, limit = 20, sort = "newest" } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build sort query
      let sortQuery;
      switch (sort) {
        case "oldest":
          sortQuery = { createdAt: 1 };
          break;
        case "popular":
          sortQuery = { "votes.score": -1, createdAt: -1 };
          break;
        default: // newest
          sortQuery = { createdAt: -1 };
      }

      // Get top-level comments (parentComment: null)
      const comments = await Comment.find({
        post: postId,
        parentComment: null,
        isDeleted: false,
      })
        .populate("authorDetails")
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum);

      // For each comment, get its direct replies
      const commentsWithReplies = await Promise.all(
        comments.map(async (comment) => {
          const replies = await Comment.find({
            parentComment: comment._id,
            isDeleted: false,
          })
            .populate("authorDetails")
            .sort({ createdAt: 1 })
            .limit(5); // Limit initial replies shown

          return {
            ...comment.toJSON(),
            replies,
            hasMoreReplies: comment.replyCount > 5,
          };
        })
      );

      const totalComments = await Comment.countDocuments({
        post: postId,
        parentComment: null,
        isDeleted: false,
      });

      const totalPages = Math.ceil(totalComments / limitNum);

      res.json({
        success: true,
        data: {
          comments: commentsWithReplies,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalComments,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get comments error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while fetching comments",
      });
    }
  },

  // @desc    Get replies for a comment
  // @route   GET /api/comments/:commentId/replies
  // @access  Public
  getCommentReplies: async (req, res) => {
    try {
      const { commentId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const replies = await Comment.find({
        parentComment: commentId,
        isDeleted: false,
      })
        .populate("authorDetails")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limitNum);

      const totalReplies = await Comment.countDocuments({
        parentComment: commentId,
        isDeleted: false,
      });

      const totalPages = Math.ceil(totalReplies / limitNum);

      res.json({
        success: true,
        data: {
          replies,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalReplies,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get replies error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while fetching replies",
      });
    }
  },

  // @desc    Update comment
  // @route   PUT /api/comments/:id
  // @access  Private (Author only)
  updateComment: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { content } = req.body;

      const comment = await Comment.findById(id);

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check if user is the author
      if (comment.author.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this comment",
        });
      }

      // Update comment
      comment.content = content;
      comment.isEdited = true;
      comment.editedAt = new Date();

      await comment.save();
      await comment.populate("authorDetails");

      res.json({
        success: true,
        message: "Comment updated successfully",
        data: { comment },
      });
    } catch (error) {
      console.error("Update comment error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while updating comment",
      });
    }
  },

  // @desc    Delete comment
  // @route   DELETE /api/comments/:id
  // @access  Private (Author only)
  deleteComment: async (req, res) => {
    try {
      const { id } = req.params;

      const comment = await Comment.findById(id);

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check if user is the author or admin
      if (
        comment.author.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this comment",
        });
      }

      // Soft delete
      comment.isDeleted = true;
      comment.content = "[Comment deleted]";
      await comment.save();

      // Update counters
      await Post.findByIdAndUpdate(comment.post, {
        $inc: { commentCount: -1 },
      });

      if (comment.parentComment) {
        await Comment.findByIdAndUpdate(comment.parentComment, {
          $inc: { replyCount: -1 },
        });
      }

      res.json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Delete comment error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while deleting comment",
      });
    }
  },

  // @desc    Vote on comment
  // @route   POST /api/comments/:id/vote
  // @access  Private
  voteComment: async (req, res) => {
    try {
      const { id } = req.params;
      const { voteType } = req.body;

      if (!["upvote", "downvote"].includes(voteType)) {
        return res.status(400).json({
          success: false,
          message: "Invalid vote type",
        });
      }

      const comment = await Comment.findById(id);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check existing vote
      const existingVote = await Vote.findOne({
        user: req.user._id,
        targetId: id,
        targetType: "Comment",
      });

      let voteChange = { upvotes: 0, downvotes: 0 };

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          // Remove vote
          await Vote.findByIdAndDelete(existingVote._id);
          voteChange[`${voteType}s`] = -1;
        } else {
          // Change vote
          const oldVoteType = existingVote.voteType;
          existingVote.voteType = voteType;
          await existingVote.save();
          voteChange[`${oldVoteType}s`] = -1;
          voteChange[`${voteType}s`] = 1;
        }
      } else {
        // New vote
        await Vote.create({
          user: req.user._id,
          targetId: id,
          targetType: "Comment",
          voteType,
        });
        voteChange[`${voteType}s`] = 1;
      }

      // Update comment votes
      comment.votes.upvotes += voteChange.upvotes;
      comment.votes.downvotes += voteChange.downvotes;
      await comment.updateVoteScore();

      res.json({
        success: true,
        message: "Vote updated successfully",
        data: {
          votes: comment.votes,
          userVote:
            existingVote && existingVote.voteType === voteType
              ? null
              : voteType,
        },
      });
    } catch (error) {
      console.error("Vote comment error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while voting",
      });
    }
  },
};

export default commentController;

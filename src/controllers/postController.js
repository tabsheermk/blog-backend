import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import Vote from "../models/Vote.js";
import { validationResult } from "express-validator";

const postController = {
  // @desc    Create new post
  // @route   POST /api/posts
  // @access  Private
  createPost: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { title, content, tags } = req.body;

      const post = new Post({
        title,
        content,
        tags: tags || [],
        author: req.user._id,
      });

      await post.save();

      // Populate author details
      await post.populate("authorDetails");

      res.status(201).json({
        success: true,
        message: "Post created successfully",
        data: { post },
      });
    } catch (error) {
      console.error("Create post error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while creating post",
      });
    }
  },

  // @desc    Get all posts with pagination and filters
  // @route   GET /api/posts
  // @access  Public
  getAllPosts: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        sort = "latest", // latest, popular, oldest
        tag,
        search,
        author,
      } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build query
      const query = { isPublished: true };

      if (tag) {
        query.tags = { $in: [tag.toLowerCase()] };
      }

      if (author) {
        query.author = author;
      }

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { content: { $regex: search, $options: "i" } },
          { tags: { $in: [new RegExp(search, "i")] } },
        ];
      }

      // Build sort
      let sortQuery;
      switch (sort) {
        case "popular":
          sortQuery = { "votes.score": -1, createdAt: -1 };
          break;
        case "oldest":
          sortQuery = { createdAt: 1 };
          break;
        default: // latest
          sortQuery = { createdAt: -1 };
      }

      // Execute query with pagination
      const posts = await Post.find(query)
        .populate("authorDetails")
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Get total count for pagination
      const totalPosts = await Post.countDocuments(query);
      const totalPages = Math.ceil(totalPosts / limitNum);

      res.json({
        success: true,
        data: {
          posts,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalPosts,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get posts error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while fetching posts",
      });
    }
  },

  // @desc    Get single post by slug
  // @route   GET /api/posts/:slug
  // @access  Public
  getPostBySlug: async (req, res) => {
    try {
      const { slug } = req.params;

      const post = await Post.findOne({ slug, isPublished: true }).populate(
        "authorDetails"
      );

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      // Increment view count
      await Post.findByIdAndUpdate(post._id, { $inc: { views: 1 } });

      res.json({
        success: true,
        data: { post },
      });
    } catch (error) {
      console.error("Get post error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while fetching post",
      });
    }
  },

  // @desc    Update post
  // @route   PUT /api/posts/:id
  // @access  Private (Author only)
  updatePost: async (req, res) => {
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
      const { title, content, tags } = req.body;

      const post = await Post.findById(id);

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      // Check if user is the author
      if (post.author.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this post",
        });
      }

      // Update fields
      if (title) post.title = title;
      if (content) post.content = content;
      if (tags) post.tags = tags;

      await post.save();
      await post.populate("authorDetails");

      res.json({
        success: true,
        message: "Post updated successfully",
        data: { post },
      });
    } catch (error) {
      console.error("Update post error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while updating post",
      });
    }
  },

  // @desc    Delete post
  // @route   DELETE /api/posts/:id
  // @access  Private (Author only)
  deletePost: async (req, res) => {
    try {
      const { id } = req.params;

      const post = await Post.findById(id);

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      // Check if user is the author or admin
      if (
        post.author.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this post",
        });
      }

      await Post.findByIdAndDelete(id);

      // Clean up related data
      await Comment.deleteMany({ post: id });
      await Vote.deleteMany({ targetId: id, targetType: "Post" });

      res.json({
        success: true,
        message: "Post deleted successfully",
      });
    } catch (error) {
      console.error("Delete post error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while deleting post",
      });
    }
  },

  // @desc    Vote on post (upvote/downvote)
  // @route   POST /api/posts/:id/vote
  // @access  Private
  votePost: async (req, res) => {
    try {
      const { id } = req.params;
      const { voteType } = req.body; // 'upvote' or 'downvote'

      if (!["upvote", "downvote"].includes(voteType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vote type. Must be "upvote" or "downvote"',
        });
      }

      const post = await Post.findById(id);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      // Check if user already voted
      const existingVote = await Vote.findOne({
        user: req.user._id,
        targetId: id,
        targetType: "Post",
      });

      let voteChange = { upvotes: 0, downvotes: 0 };

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          // Remove vote (toggle)
          await Vote.findByIdAndDelete(existingVote._id);
          voteChange[`${voteType}s`] = -1;
        } else {
          // Change vote type
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
          targetType: "Post",
          voteType,
        });
        voteChange[`${voteType}s`] = 1;
      }

      // Update post vote counts
      post.votes.upvotes += voteChange.upvotes;
      post.votes.downvotes += voteChange.downvotes;
      await post.updateVoteScore();

      res.json({
        success: true,
        message: "Vote updated successfully",
        data: {
          votes: post.votes,
          userVote:
            existingVote && existingVote.voteType === voteType
              ? null
              : voteType,
        },
      });
    } catch (error) {
      console.error("Vote post error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while voting",
      });
    }
  },

  // @desc    Get user's posts
  // @route   GET /api/posts/my-posts
  // @access  Private
  getMyPosts: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const posts = await Post.find({ author: req.user._id })
        .populate("authorDetails")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const totalPosts = await Post.countDocuments({ author: req.user._id });
      const totalPages = Math.ceil(totalPosts / limitNum);

      res.json({
        success: true,
        data: {
          posts,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalPosts,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get my posts error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while fetching posts",
      });
    }
  },
};

export default postController;

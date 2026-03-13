import express from "express";
import { body } from "express-validator";
import { auth } from "../middlewares/auth.js";
import postController from "../controllers/postController.js";
import commentController from "../controllers/commentController.js";

const router = express.Router();

// Validation middleware
const postValidation = [
  body("title")
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Title must be between 5-200 characters"),

  body("content")
    .trim()
    .isLength({ min: 50, max: 50000 })
    .withMessage("Content must be between 50-50000 characters"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("Tags must be an array")
    .custom((tags) => {
      if (tags.length > 10) {
        throw new Error("Maximum 10 tags allowed");
      }
      return true;
    }),
];

const commentValidation = [
  body("content")
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage("Comment must be between 1-1000 characters"),
];

// Post routes
router.get("/", postController.getAllPosts); // Public
router.post("/", auth, postValidation, postController.createPost); // Private
router.get("/my-posts", auth, postController.getMyPosts); // Private
router.get("/:slug", postController.getPostBySlug); // Public
router.put("/:id", auth, postValidation, postController.updatePost); // Private
router.delete("/:id", auth, postController.deletePost); // Private
router.post("/:id/vote", auth, postController.votePost); // Private

// Comment routes
router.get("/:postId/comments", commentController.getPostComments); // Public
router.post(
  "/:postId/comments",
  auth,
  commentValidation,
  commentController.addComment
); // Private

export default router;

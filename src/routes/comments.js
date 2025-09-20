import express from "express";
import { body } from "express-validator";
import { auth } from "../middlewares/auth.js";
import commentController from "../controllers/commentController.js";

const router = express.Router();

const commentValidation = [
  body("content")
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage("Comment must be between 1-1000 characters"),
];

// Comment routes
router.get("/:commentId/replies", commentController.getCommentReplies); // Public
router.put("/:id", auth, commentValidation, commentController.updateComment); // Private
router.delete("/:id", auth, commentController.deleteComment); // Private
router.post("/:id/vote", auth, commentController.voteComment); // Private

export default router;

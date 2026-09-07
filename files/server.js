const express = require("express");
const cors = require("cors");
const multer = require("multer");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

// GitHub settings from Render environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO || "pdf-storage";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

// Maximum PDF size: 10 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allow requests from your website
app.use(
  cors({
    origin: true
  })
);

// Store uploaded PDF temporarily in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

// Basic health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PDF QR backend is running"
  });
});

// Upload PDF
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!GITHUB_TOKEN) {
      return res.status(500).json({
        success: false,
        error: "GitHub token is not configured"
      });
    }

    if (!GITHUB_OWNER) {
      return res.status(500).json({
        success: false,
        error: "GitHub owner is not configured"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No PDF file was uploaded"
      });
    }

    // Check PDF signature
    const pdfSignature = req.file.buffer
      .subarray(0, 5)
      .toString("ascii");

    if (pdfSignature !== "%PDF-") {
      return res.status(400).json({
        success: false,
        error: "The uploaded file is not a valid PDF"
      });
    }

    // Clean original filename
    const originalName = req.file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 80);

    // Generate unique ID
    const uniqueId = crypto.randomBytes(8).toString("hex");

    const filename = `${uniqueId}-${originalName}`;

    const githubPath = `files/${filename}`;

    // Convert PDF to Base64 for GitHub API
    const content = req.file.buffer.toString("base64");

    // Upload to GitHub
    const githubUrl =
      `https://api.github.com/repos/` +
      `${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`;

    const githubResponse = await fetch(githubUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "pdf-qr-backend"
      },
      body: JSON.stringify({
        message: `Upload PDF: ${filename}`,
        content: content,
        branch: GITHUB_BRANCH
      })
    });

    const githubData = await githubResponse.json();

    if (!githubResponse.ok) {
      console.error("GitHub error:", githubData);

      return res.status(500).json({
        success: false,
        error: "Failed to upload PDF to GitHub"
      });
    }

    // Public GitHub Pages URL
    const pdfUrl =
      `https://${GITHUB_OWNER}.github.io/` +
      `${GITHUB_REPO}/${githubPath}`;

    return res.json({
      success: true,
      filename: filename,
      pdfUrl: pdfUrl
    });

  } catch (error) {
    console.error("Upload error:", error);

    return res.status(500).json({
      success: false,
      error: "Something went wrong while uploading the PDF"
    });
  }
});

// Handle files larger than 10 MB
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: "PDF is too large. Maximum size is 10 MB."
      });
    }
  }

  next(error);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PDF QR backend running on port ${PORT}`);
});

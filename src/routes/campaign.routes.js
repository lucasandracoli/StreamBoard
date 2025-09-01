const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const campaignController = require("../controllers/campaign.controller");
const { isAuthenticated, isAdmin } = require("../middlewares/auth.middleware");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `${uuidv4()}${fileExtension}`;
    cb(null, fileName);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/")
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Tipo de arquivo não suportado! Apenas imagens e vídeos são permitidos."
      ),
      false
    );
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

router.get(
  "/campaigns",
  isAuthenticated,
  isAdmin,
  campaignController.listCampaignsPage
);

router.get(
  "/campaigns/pipeline",
  isAuthenticated,
  isAdmin,
  campaignController.renderCampaignPipelinePage
);

router.post(
  "/campaigns",
  isAuthenticated,
  isAdmin,
  upload.array("media", 10),
  campaignController.createCampaign
);

router.post(
  "/campaigns/:id/delete",
  isAuthenticated,
  isAdmin,
  campaignController.deleteCampaign
);

router.post(
  "/campaigns/:id/edit",
  isAuthenticated,
  isAdmin,
  upload.array("media", 10),
  campaignController.editCampaign
);

router.post(
  "/api/campaigns/:id/deprioritize",
  isAuthenticated,
  isAdmin,
  campaignController.deprioritizeCampaign
);

router.get(
  "/api/campaigns/:id",
  isAuthenticated,
  isAdmin,
  campaignController.getCampaignDetails
);

module.exports = router;

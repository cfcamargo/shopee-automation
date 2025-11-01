const express = require("express");
const { getOffers } = require("../services/shopeeService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await getOffers(req.query);
    return res.json(data);
  } catch (err) {
    console.error("ERR /offers:", err?.message || err);
    return res.status(500).json({
      error: true,
      message: err.message || "Internal error",
    });
  }
});

module.exports = router;

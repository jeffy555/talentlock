import { Router } from "express";
import { COUNTRY_DATA } from "../lib/countryData";

const router = Router();

router.get("/countries", (_req, res) => {
  res.json({ countries: COUNTRY_DATA });
});

export default router;

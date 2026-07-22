import { Router } from "express";
import { db } from "@workspace/db";
import { getOrFetchExchangeRates } from "../lib/exchangeRateService";

const router = Router();

router.get("/exchange-rates", async (req, res) => {
  try {
    const snapshot = await getOrFetchExchangeRates(db, req.log);
    res.json({
      baseCurrency: snapshot.baseCurrency,
      rates: snapshot.rates,
      fetchedAt: snapshot.fetchedAt,
      source: snapshot.source,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get exchange rates");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

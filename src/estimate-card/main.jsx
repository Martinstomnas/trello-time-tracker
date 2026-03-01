import React from "react";
import { createRoot } from "react-dom/client";
import EstimateCardApp from "./EstimateCardApp.jsx";

const t = window.TrelloPowerUp.iframe();
const root = createRoot(document.getElementById("root"));
root.render(<EstimateCardApp t={t} />);

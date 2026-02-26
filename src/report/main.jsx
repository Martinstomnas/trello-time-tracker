import React from "react";
import { createRoot } from "react-dom/client";
import ReportApp from "./ReportApp.jsx";

const t = window.TrelloPowerUp.iframe();
const root = createRoot(document.getElementById("root"));
root.render(<ReportApp t={t} />);

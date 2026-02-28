import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ReportApp from "./ReportApp.jsx";
import EstimateApp from "../estimate/EstimateApp.jsx";

/**
 * ReportPage – Tabbed wrapper that shows either Tidsrapport or Tidsestimering.
 */
function ReportPage({ t }) {
  const [activeTab, setActiveTab] = useState("report");

  return (
    <div style={styles.container}>
      {/* Tab header */}
      <div style={styles.header}>
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab("report")}
            style={activeTab === "report" ? styles.tabActive : styles.tab}
          >
            Tidsrapport
          </button>
          <button
            onClick={() => setActiveTab("estimate")}
            style={activeTab === "estimate" ? styles.tabActive : styles.tab}
          >
            Tidsestimering
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={styles.content}>
        {activeTab === "report" ? (
          <ReportApp t={t} hideHeader />
        ) : (
          <EstimateApp t={t} />
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
    height: "100%",
  },
  header: {
    display: "flex",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 0,
  },
  tabs: {
    display: "flex",
    gap: 0,
    borderBottom: "2px solid #DFE1E6",
    width: "100%",
  },
  tab: {
    padding: "10px 20px",
    border: "none",
    borderBottom: "2px solid transparent",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 600,
    color: "#5E6C84",
    marginBottom: -2,
    transition: "color 0.15s, border-color 0.15s",
  },
  tabActive: {
    padding: "10px 20px",
    border: "none",
    borderBottom: "2px solid #0079BF",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 600,
    color: "#0079BF",
    marginBottom: -2,
  },
  content: {
    padding: "0",
  },
};

const t = window.TrelloPowerUp.iframe();
const root = createRoot(document.getElementById("root"));
root.render(<ReportPage t={t} />);

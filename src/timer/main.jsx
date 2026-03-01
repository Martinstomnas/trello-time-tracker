import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import TimerApp from "./TimerApp.jsx";
import EstimateCardApp from "../estimate-card/EstimateCardApp.jsx";

function TimerPage({ t }) {
  const [activeTab, setActiveTab] = useState("timer");

  useEffect(() => {
    try {
      var tab = t.arg("tab");
      if (tab) setActiveTab(tab);
    } catch (e) {
      // ingen args sendt
    }
  }, [t]);

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab("timer")}
          style={activeTab === "timer" ? styles.tabActive : styles.tab}
        >
          Registrert tid
        </button>
        <button
          onClick={() => setActiveTab("estimate")}
          style={activeTab === "estimate" ? styles.tabActive : styles.tab}
        >
          Estimert tid
        </button>
      </div>
      <div style={styles.content}>
        {activeTab === "timer" ? <TimerApp t={t} /> : <EstimateCardApp t={t} />}
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
    padding: 0,
  },
};

const t = window.TrelloPowerUp.iframe();
const root = createRoot(document.getElementById("root"));
root.render(<TimerPage t={t} />);

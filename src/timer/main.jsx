import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import TimerApp from "./TimerApp.jsx";
import EstimateCardApp from "../estimate-card/EstimateCardApp.jsx";

function TimerPage({ t }) {
  const [activeTab, setActiveTab] = useState("timer");

  return (
    <div>
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab("timer")}
          style={activeTab === "timer" ? styles.tabActive : styles.tab}
        >
          Tidsregistrering
        </button>
        <button
          onClick={() => setActiveTab("estimate")}
          style={activeTab === "estimate" ? styles.tabActive : styles.tab}
        >
          Tidsestimat
        </button>
      </div>
      {activeTab === "timer" ? <TimerApp t={t} /> : <EstimateCardApp t={t} />}
    </div>
  );
}

const styles = {
  tabs: {
    display: "flex",
    gap: 0,
    borderBottom: "2px solid #DFE1E6",
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    padding: "8px 12px",
    border: "none",
    borderBottom: "2px solid transparent",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#5E6C84",
    marginBottom: -2,
  },
  tabActive: {
    flex: 1,
    padding: "8px 12px",
    border: "none",
    borderBottom: "2px solid #0079BF",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#0079BF",
    marginBottom: -2,
  },
};

const t = window.TrelloPowerUp.iframe();
const root = createRoot(document.getElementById("root"));
root.render(<TimerPage t={t} />);

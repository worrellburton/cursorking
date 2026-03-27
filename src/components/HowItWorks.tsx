"use client";

import { useEffect, useState } from "react";

export default function HowItWorks({ onContinue, isMobile }: { onContinue: () => void; isMobile: boolean }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  const totalSteps = 4;

  const next = () => {
    if (step < totalSteps - 1) setStep(step + 1);
    else onContinue();
  };

  const fontSize = isMobile ? "0.85rem" : "1rem";
  const headingSize = isMobile ? "1.5rem" : "2.2rem";
  const subSize = isMobile ? "0.75rem" : "0.9rem";

  return (
    <div
      className="relative z-10 flex flex-col items-center justify-center w-full px-4"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.6s ease",
        maxWidth: 600,
      }}
    >
      {/* Step 0: Entry fee breakdown */}
      {step === 0 && (
        <div className="hiw-step flex flex-col items-center gap-6 text-center">
          <h2
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: headingSize,
              fontWeight: "bold",
              letterSpacing: "0.1em",
            }}
            className="title-fire"
          >
            HOW IT WORKS
          </h2>

          <p style={{ fontFamily: "'Courier New', monospace", fontSize, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
            Enter the tournament for <span style={{ color: "#22d3ee", fontWeight: "bold" }}>$1</span>
          </p>

          {/* Animated pie chart */}
          <div style={{ position: "relative", width: 200, height: 200 }}>
            <svg viewBox="0 0 200 200" width="200" height="200">
              {/* 70% Win/Lose Pool */}
              <circle
                cx="100" cy="100" r="80"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="24"
                strokeDasharray={`${0.7 * 502.65} ${0.3 * 502.65}`}
                strokeDashoffset="0"
                transform="rotate(-90 100 100)"
                className="hiw-ring"
                style={{ filter: "drop-shadow(0 0 8px #22d3ee)" }}
              />
              {/* 15% King's Cup */}
              <circle
                cx="100" cy="100" r="80"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="24"
                strokeDasharray={`${0.15 * 502.65} ${0.85 * 502.65}`}
                strokeDashoffset={`${-0.7 * 502.65}`}
                transform="rotate(-90 100 100)"
                className="hiw-ring"
                style={{ filter: "drop-shadow(0 0 8px #fbbf24)", animationDelay: "0.2s" }}
              />
              {/* 15% CursorKing Team */}
              <circle
                cx="100" cy="100" r="80"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="24"
                strokeDasharray={`${0.15 * 502.65} ${0.85 * 502.65}`}
                strokeDashoffset={`${-0.85 * 502.65}`}
                transform="rotate(-90 100 100)"
                className="hiw-ring"
                style={{ filter: "drop-shadow(0 0 8px #f43f5e)", animationDelay: "0.4s" }}
              />
              <text x="100" y="95" textAnchor="middle" fill="white" fontFamily="'Courier New', monospace" fontWeight="bold" fontSize="22">$1</text>
              <text x="100" y="115" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontFamily="'Courier New', monospace" fontSize="11">ENTRY</text>
            </svg>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "'Courier New', monospace", fontSize: subSize }}>
            <div className="hiw-legend-item" style={{ animationDelay: "0.3s" }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#22d3ee", marginRight: 8, boxShadow: "0 0 6px #22d3ee" }} />
              <span style={{ color: "#22d3ee", fontWeight: "bold" }}>70%</span>
              <span style={{ color: "rgba(255,255,255,0.6)", marginLeft: 8 }}>WIN / LOSE POOL</span>
            </div>
            <div className="hiw-legend-item" style={{ animationDelay: "0.5s" }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#fbbf24", marginRight: 8, boxShadow: "0 0 6px #fbbf24" }} />
              <span style={{ color: "#fbbf24", fontWeight: "bold" }}>15%</span>
              <span style={{ color: "rgba(255,255,255,0.6)", marginLeft: 8 }}>KING&apos;S CUP</span>
            </div>
            <div className="hiw-legend-item" style={{ animationDelay: "0.7s" }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#f43f5e", marginRight: 8, boxShadow: "0 0 6px #f43f5e" }} />
              <span style={{ color: "#f43f5e", fontWeight: "bold" }}>15%</span>
              <span style={{ color: "rgba(255,255,255,0.6)", marginLeft: 8 }}>CURSORKING TEAM</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Tournament bracket */}
      {step === 1 && (
        <div className="hiw-step flex flex-col items-center gap-6 text-center">
          <h2
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: headingSize,
              fontWeight: "bold",
              letterSpacing: "0.1em",
              color: "#22d3ee",
              textShadow: "0 0 15px rgba(34,211,238,0.6)",
            }}
          >
            BRACKET TOURNAMENT
          </h2>

          <p style={{ fontFamily: "'Courier New', monospace", fontSize, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
            Win your match. Advance. Repeat.
          </p>

          {/* Animated bracket */}
          <div style={{ position: "relative", width: isMobile ? 300 : 400, height: 220 }}>
            <svg viewBox="0 0 400 220" width="100%" height="100%">
              {/* Round 1 */}
              <rect x="10" y="20" width="80" height="28" rx="4" fill="rgba(34,211,238,0.15)" stroke="#22d3ee" strokeWidth="1" className="hiw-bracket-node" style={{ animationDelay: "0s" }} />
              <text x="50" y="39" textAnchor="middle" fill="#22d3ee" fontSize="10" fontFamily="'Courier New', monospace">PLAYER 1</text>

              <rect x="10" y="60" width="80" height="28" rx="4" fill="rgba(244,63,94,0.15)" stroke="#f43f5e" strokeWidth="1" className="hiw-bracket-node" style={{ animationDelay: "0.1s" }} />
              <text x="50" y="79" textAnchor="middle" fill="#f43f5e" fontSize="10" fontFamily="'Courier New', monospace">PLAYER 2</text>

              <rect x="10" y="120" width="80" height="28" rx="4" fill="rgba(34,211,238,0.15)" stroke="#22d3ee" strokeWidth="1" className="hiw-bracket-node" style={{ animationDelay: "0.2s" }} />
              <text x="50" y="139" textAnchor="middle" fill="#22d3ee" fontSize="10" fontFamily="'Courier New', monospace">PLAYER 3</text>

              <rect x="10" y="160" width="80" height="28" rx="4" fill="rgba(244,63,94,0.15)" stroke="#f43f5e" strokeWidth="1" className="hiw-bracket-node" style={{ animationDelay: "0.3s" }} />
              <text x="50" y="179" textAnchor="middle" fill="#f43f5e" fontSize="10" fontFamily="'Courier New', monospace">PLAYER 4</text>

              {/* Lines R1 -> R2 */}
              <path d="M90,34 L130,34 L130,54 L160,54" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" className="hiw-bracket-line" style={{ animationDelay: "0.4s" }} />
              <path d="M90,74 L130,74 L130,54 L160,54" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" className="hiw-bracket-line" style={{ animationDelay: "0.5s" }} />
              <path d="M90,134 L130,134 L130,154 L160,154" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" className="hiw-bracket-line" style={{ animationDelay: "0.6s" }} />
              <path d="M90,174 L130,174 L130,154 L160,154" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" className="hiw-bracket-line" style={{ animationDelay: "0.7s" }} />

              {/* Round 2 */}
              <rect x="160" y="40" width="80" height="28" rx="4" fill="rgba(34,211,238,0.2)" stroke="#22d3ee" strokeWidth="1.5" className="hiw-bracket-node" style={{ animationDelay: "0.6s" }} />
              <text x="200" y="59" textAnchor="middle" fill="#22d3ee" fontSize="10" fontFamily="'Courier New', monospace" fontWeight="bold">WINNER</text>

              <rect x="160" y="140" width="80" height="28" rx="4" fill="rgba(34,211,238,0.2)" stroke="#22d3ee" strokeWidth="1.5" className="hiw-bracket-node" style={{ animationDelay: "0.7s" }} />
              <text x="200" y="159" textAnchor="middle" fill="#22d3ee" fontSize="10" fontFamily="'Courier New', monospace" fontWeight="bold">WINNER</text>

              {/* Lines R2 -> Final */}
              <path d="M240,54 L280,54 L280,104 L310,104" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" className="hiw-bracket-line" style={{ animationDelay: "0.9s" }} />
              <path d="M240,154 L280,154 L280,104 L310,104" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" className="hiw-bracket-line" style={{ animationDelay: "1.0s" }} />

              {/* Final - KING */}
              <rect x="310" y="86" width="80" height="36" rx="6" fill="rgba(251,191,36,0.2)" stroke="#fbbf24" strokeWidth="2" className="hiw-bracket-king" style={{ animationDelay: "1.1s" }} />
              <text x="350" y="108" textAnchor="middle" fill="#fbbf24" fontSize="12" fontFamily="'Courier New', monospace" fontWeight="bold">KING</text>

              {/* Crown icon */}
              <text x="350" y="82" textAnchor="middle" fontSize="16" className="hiw-crown">&#x1F451;</text>
            </svg>
          </div>

          <p style={{ fontFamily: "'Courier New', monospace", fontSize: subSize, color: "rgba(255,255,255,0.5)", maxWidth: 320 }}>
            Win your match to earn from the pool. Lose and you&apos;re out.
          </p>
        </div>
      )}

      {/* Step 2: King of the Hill */}
      {step === 2 && (
        <div className="hiw-step flex flex-col items-center gap-6 text-center">
          <h2
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: headingSize,
              fontWeight: "bold",
              letterSpacing: "0.1em",
              color: "#fbbf24",
              textShadow: "0 0 20px rgba(251,191,36,0.6)",
            }}
          >
            KING OF THE HILL
          </h2>

          <p style={{ fontFamily: "'Courier New', monospace", fontSize, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, maxWidth: 380 }}>
            The tournament winner becomes the <span style={{ color: "#fbbf24", fontWeight: "bold" }}>KING</span>
          </p>

          {/* Animated crown + timer */}
          <div style={{ position: "relative", width: 240, height: 200 }}>
            {/* Glow ring */}
            <div className="hiw-king-ring" style={{
              position: "absolute", top: 20, left: 20, width: 200, height: 200,
              borderRadius: "50%",
              border: "2px solid rgba(251,191,36,0.3)",
              boxShadow: "0 0 30px rgba(251,191,36,0.2), inset 0 0 30px rgba(251,191,36,0.1)",
            }} />

            <div style={{
              position: "absolute", top: 50, left: 0, width: 240, textAlign: "center",
              fontFamily: "'Courier New', monospace",
            }}>
              <div style={{ fontSize: "3rem" }} className="hiw-crown-bounce">&#x1F451;</div>
              <div style={{ fontSize: "1.2rem", color: "#fbbf24", fontWeight: "bold", marginTop: 4, textShadow: "0 0 10px rgba(251,191,36,0.5)" }}>THE KING</div>
              <div className="hiw-timer" style={{
                marginTop: 12, fontSize: "1.8rem", fontWeight: "bold",
                color: "#22d3ee", textShadow: "0 0 15px rgba(34,211,238,0.5)",
              }}>
                12:34
              </div>
              <div style={{ fontSize: subSize, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>TIME ON THRONE</div>
            </div>
          </div>

          <p style={{ fontFamily: "'Courier New', monospace", fontSize: subSize, color: "rgba(255,255,255,0.5)", maxWidth: 320, lineHeight: 1.5 }}>
            The longer you reign, the more time you accumulate.
            More time = bigger share of the <span style={{ color: "#fbbf24" }}>KING&apos;S CUP</span>
          </p>
        </div>
      )}

      {/* Step 3: King's Cup Payout */}
      {step === 3 && (
        <div className="hiw-step flex flex-col items-center gap-6 text-center">
          <h2
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: headingSize,
              fontWeight: "bold",
              letterSpacing: "0.1em",
              color: "#fbbf24",
              textShadow: "0 0 20px rgba(251,191,36,0.6)",
            }}
          >
            DAILY KING&apos;S CUP
          </h2>

          <p style={{ fontFamily: "'Courier New', monospace", fontSize, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, maxWidth: 380 }}>
            Every day, the King&apos;s Cup pays out
          </p>

          {/* Animated payout bars */}
          <div style={{ width: isMobile ? 280 : 340, display: "flex", flexDirection: "column", gap: 10, fontFamily: "'Courier New', monospace" }}>
            <div className="hiw-bar-row" style={{ animationDelay: "0.2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
                <span style={{ fontSize: "1.2rem" }}>&#x1F451;</span>
                <span style={{ color: "#fbbf24", fontSize: subSize, fontWeight: "bold" }}>KING #1</span>
              </div>
              <div style={{ flex: 1, height: 24, background: "rgba(251,191,36,0.1)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                <div className="hiw-bar" style={{ width: "85%", height: "100%", background: "linear-gradient(90deg, #fbbf24, #f59e0b)", borderRadius: 4, boxShadow: "0 0 10px rgba(251,191,36,0.5)" }} />
                <span style={{ position: "absolute", right: 8, top: 3, fontSize: "0.7rem", color: "rgba(0,0,0,0.7)", fontWeight: "bold" }}>8h 23m</span>
              </div>
            </div>

            <div className="hiw-bar-row" style={{ animationDelay: "0.4s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
                <span style={{ fontSize: "1.2rem" }}>&#x1F451;</span>
                <span style={{ color: "#22d3ee", fontSize: subSize, fontWeight: "bold" }}>KING #2</span>
              </div>
              <div style={{ flex: 1, height: 24, background: "rgba(34,211,238,0.1)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                <div className="hiw-bar" style={{ width: "45%", height: "100%", background: "linear-gradient(90deg, #22d3ee, #0891b2)", borderRadius: 4, boxShadow: "0 0 10px rgba(34,211,238,0.5)", animationDelay: "0.2s" }} />
                <span style={{ position: "absolute", right: 8, top: 3, fontSize: "0.7rem", color: "rgba(255,255,255,0.6)", fontWeight: "bold" }}>4h 12m</span>
              </div>
            </div>

            <div className="hiw-bar-row" style={{ animationDelay: "0.6s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 100 }}>
                <span style={{ fontSize: "1.2rem" }}>&#x1F451;</span>
                <span style={{ color: "#f43f5e", fontSize: subSize, fontWeight: "bold" }}>KING #3</span>
              </div>
              <div style={{ flex: 1, height: 24, background: "rgba(244,63,94,0.1)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                <div className="hiw-bar" style={{ width: "20%", height: "100%", background: "linear-gradient(90deg, #f43f5e, #e11d48)", borderRadius: 4, boxShadow: "0 0 10px rgba(244,63,94,0.5)", animationDelay: "0.4s" }} />
                <span style={{ position: "absolute", right: 8, top: 3, fontSize: "0.7rem", color: "rgba(255,255,255,0.6)", fontWeight: "bold" }}>1h 45m</span>
              </div>
            </div>
          </div>

          <p style={{ fontFamily: "'Courier New', monospace", fontSize: subSize, color: "rgba(255,255,255,0.5)", maxWidth: 340, lineHeight: 1.5 }}>
            Your payout is proportional to your time as King.
            Reign longer = earn more from the daily cup.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <button
          onClick={next}
          className="arena-btn"
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: isMobile ? "1rem" : "1.2rem",
            fontWeight: "bold",
            color: "#fff",
            border: "2px solid rgba(255, 160, 50, 0.8)",
            borderRadius: "9999px",
            padding: isMobile ? "12px 32px" : "14px 48px",
            background: "rgba(255, 80, 20, 0.1)",
            cursor: "pointer",
            textShadow: "0 0 10px rgba(255, 200, 50, 1), 0 0 20px rgba(255, 120, 20, 0.8)",
            boxShadow: "0 0 15px rgba(255, 120, 20, 0.4), 0 0 30px rgba(255, 60, 10, 0.2)",
            letterSpacing: "0.15em",
            animation: "fire-glow 1.5s ease-in-out infinite",
          }}
        >
          {step < totalSteps - 1 ? "NEXT" : "LET\u2019S GO"}
        </button>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 8 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === step ? "#fbbf24" : "rgba(255,255,255,0.2)",
                boxShadow: i === step ? "0 0 8px #fbbf24" : "none",
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>

        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.3)",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.1em",
            }}
          >
            BACK
          </button>
        )}
      </div>

      <style jsx>{`
        .hiw-step {
          animation: hiw-fade-in 0.5s ease forwards;
        }
        @keyframes hiw-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hiw-ring {
          animation: hiw-ring-draw 1.2s ease forwards;
          stroke-dashoffset: 502.65;
        }
        @keyframes hiw-ring-draw {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .hiw-legend-item {
          display: flex;
          align-items: center;
          animation: hiw-fade-in 0.5s ease forwards;
          opacity: 0;
        }
        .hiw-bracket-node {
          animation: hiw-fade-in 0.4s ease forwards;
          opacity: 0;
        }
        .hiw-bracket-line {
          animation: hiw-line-draw 0.6s ease forwards;
          opacity: 0;
        }
        @keyframes hiw-line-draw {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .hiw-bracket-king {
          animation: hiw-king-pulse 1.5s ease-in-out infinite, hiw-fade-in 0.5s ease forwards;
          opacity: 0;
        }
        @keyframes hiw-king-pulse {
          0%, 100% { box-shadow: 0 0 10px rgba(251,191,36,0.3); }
          50% { box-shadow: 0 0 25px rgba(251,191,36,0.6); }
        }
        .hiw-crown {
          animation: hiw-crown-float 2s ease-in-out infinite;
        }
        @keyframes hiw-crown-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .hiw-crown-bounce {
          animation: hiw-crown-float 2s ease-in-out infinite;
          display: inline-block;
        }
        .hiw-king-ring {
          animation: hiw-ring-rotate 8s linear infinite;
        }
        @keyframes hiw-ring-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .hiw-timer {
          animation: hiw-timer-tick 1s step-end infinite;
        }
        @keyframes hiw-timer-tick {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .hiw-bar-row {
          display: flex;
          align-items: center;
          gap: 8px;
          animation: hiw-fade-in 0.5s ease forwards;
          opacity: 0;
        }
        .hiw-bar {
          animation: hiw-bar-grow 1s ease forwards;
          transform-origin: left;
        }
        @keyframes hiw-bar-grow {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}

import { ImageResponse } from "next/og";
import { SOCIAL_IMAGE_SIZE } from "@/lib/metadata";

function Record({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 9999,
        background: "#171713",
        border: "3px solid #171713",
        boxShadow: "18px 20px 0 #171713",
        position: "relative",
      }}
    >
      {[0.84, 0.68, 0.52].map((scale) => (
        <div
          key={scale}
          style={{
            width: size * scale,
            height: size * scale,
            display: "flex",
            borderRadius: 9999,
            border: "2px solid #4e4c46",
            position: "absolute",
          }}
        />
      ))}
      <div
        style={{
          width: size * 0.34,
          height: size * 0.34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 9999,
          background: "#ff5c35",
          border: "3px solid #171713",
          position: "absolute",
        }}
      >
        <div
          style={{
            width: size * 0.055,
            height: size * 0.055,
            display: "flex",
            borderRadius: 9999,
            background: "#f4f0e6",
          }}
        />
      </div>
    </div>
  );
}

export function renderSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "54px 64px",
          color: "#171713",
          background: "#f4f0e6",
          border: "18px solid #171713",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 440,
            height: 440,
            display: "flex",
            borderRadius: 9999,
            background: "#bde66c",
            position: "absolute",
            right: -100,
            top: -160,
          }}
        />
        <div
          style={{
            width: 250,
            height: 250,
            display: "flex",
            borderRadius: 9999,
            background: "#ff5c35",
            position: "absolute",
            left: 465,
            bottom: -170,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: -1,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              background: "#171713",
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                display: "flex",
                borderRadius: 9999,
                background: "#ff5c35",
                border: "4px solid #f4f0e6",
              }}
            />
          </div>
          dropday
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 48,
          }}
        >
          <div
            style={{
              width: 680,
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontFamily: "serif",
                fontSize: 78,
                fontWeight: 700,
                lineHeight: 0.94,
                letterSpacing: -4,
              }}
            >
              <span>Music is better</span>
              <span style={{ color: "#e54a28", fontStyle: "italic" }}>in rotation.</span>
            </div>
            <div
              style={{
                maxWidth: 650,
                display: "flex",
                color: "#55534d",
                fontSize: 23,
                lineHeight: 1.35,
              }}
            >
              Playlist clubs with a proper schedule, a fair queue, and a room for every drop.
            </div>
          </div>

          <div
            style={{
              width: 330,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingBottom: 18,
            }}
          >
            <Record size={280} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 22,
            borderTop: "3px solid #171713",
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 2.2,
            textTransform: "uppercase",
          }}
        >
          <span>Spotify + Apple Music</span>
          <span>Real people · real rotation</span>
        </div>
      </div>
    ),
    SOCIAL_IMAGE_SIZE,
  );
}

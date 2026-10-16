import React, { useId } from "react";
export default function RoomArt({
  direction = "calm",
  room = "Living room",
  small = false,
}) {
  const uid = useId().replaceAll(":", "");
  const warm = direction === "warm";
  const shared = direction === "balanced";
  const wall = warm ? "#d9bba0" : "#ded9c9",
    sofa = warm ? "#ac634b" : shared ? "#a1a18a" : "#a3aa94",
    wood = warm ? "#79533b" : "#a0825b";
  return (
    <svg
      className="room-art"
      viewBox="0 0 960 720"
      role="img"
      aria-label={`Original conceptual illustration of a ${direction} ${room.toLowerCase()}`}
    >
      <defs>
        <linearGradient id={uid + "wall"} x2="1" y2="1">
          <stop stopColor={wall} />
          <stop offset="1" stopColor="#b7ae98" />
        </linearGradient>
        <linearGradient id={uid + "floor"} x2="0" y2="1">
          <stop stopColor="#c7ad89" />
          <stop offset="1" stopColor="#ad8a67" />
        </linearGradient>
        <linearGradient id={uid + "curtain"}>
          <stop stopColor="#eee8d8" />
          <stop offset=".45" stopColor="#d4caba" />
          <stop offset=".7" stopColor="#f1ebdf" />
          <stop offset="1" stopColor="#c6bdab" />
        </linearGradient>
        <linearGradient id={uid + "seat"} x2="0" y2="1">
          <stop stopColor={sofa} />
          <stop offset="1" stopColor={warm ? "#8e4d3b" : "#7d876e"} />
        </linearGradient>
        <filter id={uid + "shadow"}>
          <feGaussianBlur stdDeviation="13" />
        </filter>
        <pattern
          id={uid + "grain"}
          width="85"
          height="9"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 4q20-7 50 0t40 0"
            fill="none"
            stroke="#fff"
            strokeOpacity=".06"
          />
        </pattern>
      </defs>
      <path d="M0 0h960v496L0 544z" fill={`url(#${uid}wall)`} />
      <path d="M0 544 960 496v224H0z" fill={`url(#${uid}floor)`} />
      <path d="m0 548 960-47" stroke="#93876e" strokeWidth="5" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path
          key={i}
          d={`M${i * 150} 540 ${i * 185 - 180} 720`}
          stroke="#755e44"
          opacity=".22"
        />
      ))}
      <path d="M58 0h254v413H58z" fill="#8c9986" />
      <path d="M78 0h216v391H78z" fill="#d4d7bf" />
      <path d="M88 0h191v337H88z" fill="#b6c5ac" />
      <path d="M90 139q70-55 190-10v209H90z" fill="#9daa8e" />
      <path
        d="M115 0v390m100-390v390M75 208h217"
        stroke="#e5e0ce"
        strokeWidth="9"
      />
      <path
        d="M277 0h77v448l-78-26q25-172 1-422"
        fill={`url(#${uid}curtain)`}
      />
      <path d="M51 0h52q-24 205 0 426H22z" fill={`url(#${uid}curtain)`} />
      <path d="m90 397 175-6 330 242-303 37z" fill="#fff1cc" opacity=".25" />
      <g transform="translate(513 105)">
        <path d="M0 0h210v228H0z" fill="#82735a" />
        <path d="M8 8h194v212H8z" fill="#ece4cf" />
        <path
          d="M30 188V86a63 63 0 0 1 126 0v102z"
          fill={warm ? "#c27453" : "#a0a68b"}
        />
        <circle cx="145" cy="64" r="28" fill="#d5b06e" />
        <path d="M32 189 166 97v92z" fill={warm ? "#864e3d" : "#566657"} />
      </g>
      <ellipse
        cx="525"
        cy="608"
        rx="350"
        ry="47"
        fill="#4f4434"
        opacity=".22"
        filter={`url(#${uid}shadow)`}
      />
      <path d="m177 520 478-30 185 160-518 55z" fill="#ded3bb" />
      <path
        d="m200 532 442-27 160 135-475 49z"
        fill="none"
        stroke="#b3a589"
        strokeWidth="2"
      />
      {room === "Home office" ? (
        <g>
          <path d="m305 394 400-15 75 30-404 29z" fill={wood} />
          <path
            d="m327 428 14 160h15l9-161m322-23 5 152h15l10-153"
            fill="#5a5447"
          />
          <path d="M470 333h140v77H470z" fill="#585d55" />
          <path d="M477 340h126v62H477z" fill="#d6d2bd" />
          <path d="M527 410v15h27v-15" fill="#585d55" />
          <path d="M395 440q0-70 86-44l25 111h-98z" fill={sofa} />
          <path d="M411 503h92v21h-92z" fill={sofa} />
          <path
            d="M449 524v75m-42 5 45-12 45 8"
            stroke="#544d40"
            strokeWidth="8"
          />
        </g>
      ) : room === "Bedroom" ? (
        <g>
          <path d="M304 356q0-15 20-15h344q20 0 20 18v137H304z" fill={sofa} />
          <path d="m305 433 385-8 101 178-425 39z" fill="#d3c7ad" />
          <path d="m334 424 327-5 33 48-336 15z" fill="#f1e8d6" />
          <path d="m347 483 360-26 59 105-380 43z" fill={sofa} />
          <path d="m368 639 422-38v18l-423 40z" fill={wood} />
        </g>
      ) : (
        <g>
          <path
            d="M300 387q-4-31 31-34l329-7q35 0 39 35l13 107-405 20z"
            fill={`url(#${uid}seat)`}
          />
          <path d="m301 453 403-7 36 69-426 20z" fill={sofa} />
          <path d="M314 504 743 485v58l-426 25z" fill={`url(#${uid}seat)`} />
          <path
            d="M292 411q-14-12-23 0l-2 107q0 20 25 20h33l-3-111q0-12-30-16m403-23q-5-16 13-17l22-1q20 0 21 23l9 109q0 20-22 24h-24z"
            fill={sofa}
          />
          <path
            d="m331 567 4 22 15-1 2-23m350-19 4 20 15-1 2-23"
            fill="#594b37"
          />
          <path d="m352 391 67-5 16 75-75 4z" fill="#e7dcc5" />
          <path
            d="m600 375 54 1 22 75-67 3z"
            fill={warm ? "#d8a956" : "#777c5e"}
          />
          <path d="m493 355 28 0 5 91" stroke="#5a614f" opacity=".3" />
        </g>
      )}
      <g>
        <ellipse cx="473" cy="598" rx="115" ry="33" fill={wood} />
        <path
          d="M359 591v16q9 32 111 34 109-2 118-34v-15q-23 28-115 28-91 0-114-29"
          fill={wood}
        />
        <path d="M383 628v56h12l9-49m138-1 7 46h12v-56" fill="#796145" />
        <ellipse cx="475" cy="588" rx="114" ry="30" fill="#b69a73" />
        <ellipse
          cx="475"
          cy="588"
          rx="114"
          ry="30"
          fill={`url(#${uid}grain)`}
        />
        <path d="m404 574 62-7 24 12-66 9z" fill="#eee5cd" />
        <path d="m424 587 66-9v5l-66 10z" fill="#716554" />
        <ellipse cx="517" cy="579" rx="18" ry="7" fill="#a95e43" />
        <path d="M499 563q-2 18 18 18t18-18z" fill="#c7835c" />
      </g>
      <g>
        <path d="M802 306v230" stroke="#554d3c" strokeWidth="6" />
        <ellipse cx="802" cy="541" rx="29" ry="7" fill="#5e5542" />
        <path d="m754 308 21-74h55l26 74z" fill="#efe3c8" />
        <ellipse cx="805" cy="308" rx="51" ry="7" fill="#ccb58c" />
      </g>
      <g>
        <path
          d="m143 456 39-1 21 112q-27 17-56 1z"
          fill={warm ? "#5c4148" : "#8d6e4e"}
        />
        <path
          d="M169 456q-30-89-4-157m5 156q29-86 61-103m-60 73q-47-54-56-66"
          fill="none"
          stroke="#626e4e"
          strokeWidth="4"
        />
        <ellipse
          cx="160"
          cy="333"
          rx="14"
          ry="37"
          fill="#657354"
          transform="rotate(-20 160 333)"
        />
        <ellipse
          cx="211"
          cy="370"
          rx="13"
          ry="34"
          fill="#7a8560"
          transform="rotate(43 211 370)"
        />
        <ellipse
          cx="130"
          cy="388"
          rx="13"
          ry="31"
          fill="#6c7751"
          transform="rotate(-43 130 388)"
        />
      </g>
      <rect width="960" height="720" fill={`url(#${uid}grain)`} opacity=".5" />
    </svg>
  );
}

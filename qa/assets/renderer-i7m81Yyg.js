import{r as e}from"./mode-routing-xHcbACwO.js";var t=`:root {
  font-family: Arial, Helvetica, sans-serif;
  color: #eee8de;
  background: #100f13;
  font-synthesis: none;
  color-scheme: dark;
  --muted: #a29c99;
  --gold: #d8b979;
  --line: #ffffff14;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
a,
input {
  -webkit-tap-highlight-color: transparent;
}
button {
  font: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid #e9c780;
  outline-offset: 5px;
}
button[hidden],
div[hidden] {
  display: none;
}
a {
  color: inherit;
  text-decoration: none;
}
.lab {
  max-width: 1120px;
  margin: auto;
  padding: 30px 38px 38px;
}
.masthead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0 28px;
  border-bottom: 1px solid var(--line);
}
.wordmark {
  font-weight: 700;
  letter-spacing: 0.2em;
  font-size: 12px;
  line-height: 1.6;
}
.wordmark span {
  display: block;
  font-size: 9px;
  letter-spacing: 0.27em;
  color: var(--muted);
  font-weight: 400;
}
.isolation {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--muted);
}
.isolation i {
  width: 5px;
  height: 5px;
  border-radius: 100%;
  background: #c4ac79;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 418px) minmax(0, 1fr);
  gap: 72px;
  padding-top: 35px;
  align-items: start;
}
.preview-column {
  min-width: 0;
}
.stage {
  position: relative;
  aspect-ratio: 390/600;
  isolation: isolate;
  overflow: hidden;
  border-radius: 14px;
  background: radial-gradient(ellipse at 50% 45%, #573b35 0%, #2c2026 34%, #17141b 69%);
  border: 1px solid #9f796e33;
  box-shadow: 0 20px 60px #0003;
  contain: layout paint;
}
.stage-grain {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, #0c0a10b3, transparent 23%, transparent 78%, #0c0a1050),
    repeating-linear-gradient(90deg, #ffffff02 0 1px, transparent 1px 4px);
  pointer-events: none;
}
.stage-topline,
.stage-bottomline {
  position: absolute;
  z-index: 3;
  left: 22px;
  right: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 8px;
  letter-spacing: 0.13em;
  color: #dfc99a;
  pointer-events: none;
}
.stage-topline {
  top: 23px;
}
.stage-topline span:last-child {
  border: 1px solid #d5b5754d;
  border-radius: 3px;
  padding: 5px 6px;
  font-size: 9px;
  letter-spacing: 0.1em;
}
.stage-bottomline {
  bottom: 23px;
  color: #b8a594;
  font-size: 7px;
}
.stage-idle {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.eyebrow {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--gold);
  line-height: 1.7;
}
.stage-idle h1 {
  font-family: Georgia, serif;
  font-size: clamp(38px, 5vw, 59px);
  font-weight: 400;
  line-height: 1.04;
  letter-spacing: -0.04em;
  margin: 22px 0 10px;
}
.stage-idle h1 em {
  font-weight: 400;
  color: #e6c897;
}
.idle-seal {
  font-family: Georgia, serif;
  font-size: 45px;
  font-weight: 400;
  margin: 18px 0;
  color: #dbc28e;
}
.stage-invitation {
  font-size: 7px;
  letter-spacing: 0.17em;
  color: #bdac9e;
  margin-top: 15px;
}
.scene-mount {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.stage.is-playing .stage-idle {
  visibility: hidden;
}
.transport {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 17px;
  flex-wrap: wrap;
}
.play-button {
  background: #e4c58f;
  border: 1px solid #e4c58f;
  color: #201912;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
  padding: 12px 15px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.play-button span {
  font-size: 10px;
}
.skip-button {
  background: none;
  border: none;
  color: #c2b9ad;
  font-size: 11px;
  padding: 10px 4px;
}
.toggle {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #b4aca3;
  position: relative;
  cursor: pointer;
}
.toggle input {
  position: absolute;
  opacity: 0;
  width: 29px;
  height: 20px;
  left: 0;
  cursor: pointer;
  margin: 0;
}
.toggle-track {
  display: inline-block;
  width: 28px;
  height: 16px;
  border-radius: 12px;
  background: #403b36;
  position: relative;
  pointer-events: none;
}
.toggle-track:after {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  background: #c6bba9;
}
.toggle input:checked + .toggle-track {
  background: #b69961;
}
.toggle input:checked + .toggle-track:after {
  left: 15px;
  background: #201a12;
}
.toggle input:focus-visible + .toggle-track {
  outline: 2px solid #e9c780;
  outline-offset: 4px;
}
.play-status {
  font-size: 10px;
  color: #9f958a;
  line-height: 1.6;
  margin: 12px 0 0;
  min-height: 32px;
}
.notes-column {
  padding-top: 17px;
  min-width: 0;
}
.notes-column h2 {
  font-family: Georgia, serif;
  font-size: 36px;
  font-weight: 400;
  line-height: 1.14;
  letter-spacing: -0.025em;
  margin: 14px 0 16px;
}
.intro {
  max-width: 340px;
  color: #b4aca6;
  font-size: 13px;
  line-height: 1.8;
  margin: 0;
}
.beats {
  list-style: none;
  margin: 25px 0 30px;
  padding: 0;
  display: grid;
  gap: 17px;
}
.beats li {
  display: flex;
  gap: 17px;
  align-items: baseline;
}
.beats li > span {
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: #c5a974;
  min-width: 29px;
}
.beats strong {
  font-size: 12px;
  font-weight: 400;
  color: #e3d8c9;
}
.beats p {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
  margin: 5px 0 0;
}
.measure-section {
  border-top: 1px solid var(--line);
  padding-top: 20px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h3 {
  font-size: 12px;
  font-weight: 400;
  margin: 0;
}
.section-heading > span {
  font-size: 8px;
  letter-spacing: 0.12em;
  color: #918779;
}
.asset-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 17px;
  margin: 18px 0;
}
.asset-summary > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asset-summary strong {
  font-weight: 400;
  font-size: 23px;
  font-variant-numeric: tabular-nums;
  color: #e1c594;
}
.asset-summary span {
  font-size: 9px;
  line-height: 1.5;
  color: #a89e92;
}
.benchmark-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 13px;
  border: 1px solid #b5a28a40;
  border-radius: 6px;
  background: #ffffff03;
  color: #cdbfae;
  font-size: 11px;
  text-align: left;
}
.benchmark-button:hover:not(:disabled) {
  background: #ffffff08;
}
.benchmark-button span {
  font-size: 16px;
}
.measurement-status {
  font-size: 10px;
  color: #a49a8f;
  line-height: 1.6;
  margin: 10px 0;
}
.fineprint {
  font-size: 9px;
  line-height: 1.7;
  color: #948b82;
  margin: 12px 0 0;
}
.lab-footnote {
  font-size: 7px;
  letter-spacing: 0.1em;
  color: #8c837b;
  margin-top: 22px;
  line-height: 1.8;
}
.results {
  overflow-x: auto;
}
.results table {
  border-collapse: collapse;
  width: 100%;
  font-size: 10px;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.results th {
  font-size: 8px;
  font-weight: 400;
  color: #a39786;
  padding: 10px 6px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.results td {
  padding: 9px 6px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.download-button {
  border: 0;
  padding: 9px 0;
  background: transparent;
  color: #d2b67d;
  font-size: 10px;
  text-decoration: underline;
  text-underline-offset: 4px;
}
/* Animation artwork uses only transform and opacity changes. */
.loh-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.loh-halo {
  position: absolute;
  left: 10%;
  top: 9%;
  width: 80%;
  height: 74%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #e7bc6e40, transparent 68%);
  opacity: 0;
}
.loh-floor {
  position: absolute;
  left: 17%;
  width: 66%;
  height: 6%;
  bottom: 17%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d8b67d4d, #d8b67d00 70%);
  opacity: 0;
}
.loh-figure {
  position: absolute;
  height: 74%;
  aspect-ratio: 2/3;
  left: 50%;
  bottom: 18%;
  margin-left: -40%;
  width: 80%;
  opacity: 0;
  transform-origin: 50% 92%;
}
.loh-person {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  pointer-events: none;
}
.loh-royal {
  opacity: 0;
}
.loh-crown {
  position: absolute;
  width: 13.6%;
  height: auto;
  left: 43.2%;
  top: 3.5%;
  opacity: 0;
  transform-origin: 50% 85%;
  overflow: visible;
}
.loh-glint {
  position: absolute;
  top: 9%;
  left: 45%;
  width: 10%;
  aspect-ratio: 1;
  background: radial-gradient(circle, #fff8ddcc, transparent 67%);
  opacity: 0;
}
.loh-star {
  position: absolute;
  width: 7px;
  height: 7px;
  background: #ffe4a3;
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
  opacity: 0;
}
.loh-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 38%, #fff5d4cc, #e6bf7933 47%, transparent 70%);
  opacity: 0;
  pointer-events: none;
}
.loh-titles {
  position: absolute;
  left: 7%;
  right: 7%;
  bottom: 7.3%;
  text-align: center;
  opacity: 0;
}
.loh-kicker {
  font-size: 7px;
  letter-spacing: 0.28em;
  color: #d8bf91;
  margin-bottom: 5px;
}
.loh-name {
  font-family: Georgia, serif;
  color: #f3e6ce;
  font-size: 34px;
  line-height: 1.05;
  font-weight: 400;
  letter-spacing: -0.035em;
}
.loh-title {
  font-size: 8px;
  letter-spacing: 0.15em;
  color: #e0c48a;
  margin-top: 7px;
}
.loh-static .loh-figure,
.loh-static .loh-royal,
.loh-static .loh-crown,
.loh-static .loh-halo,
.loh-static .loh-floor,
.loh-static .loh-titles {
  opacity: 1;
}
.loh-static .loh-before {
  opacity: 0;
}
@media (min-width: 1000px) {
  .loh-figure {
    width: 80%;
    margin-left: -40%;
  }
}
@media (max-width: 800px) {
  .lab {
    padding: 22px 22px 30px;
  }
  .workspace {
    gap: 30px;
    grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
  }
  .notes-column h2 {
    font-size: 29px;
  }
  .notes-column {
    padding-top: 5px;
  }
  .eyebrow {
    font-size: 8px;
  }
  .beats {
    gap: 13px;
    margin: 20px 0;
  }
  .intro {
    font-size: 12px;
  }
  .asset-summary strong {
    font-size: 20px;
  }
}
@media (max-width: 620px) {
  .lab {
    padding: 18px 20px 28px;
    max-width: 450px;
  }
  .masthead {
    padding-bottom: 19px;
  }
  .isolation {
    font-size: 9px;
  }
  .workspace {
    display: block;
    padding-top: 23px;
  }
  .stage {
    max-width: 390px;
    margin: auto;
  }
  .notes-column {
    padding-top: 30px;
  }
  .stage-idle h1 {
    font-size: 49px;
  }
  .notes-column h2 {
    font-size: 34px;
  }
  .notes-column h2 br {
    display: none;
  }
  .intro {
    max-width: none;
  }
  .stage-topline {
    font-size: 7px;
  }
  .transport {
    gap: 9px;
  }
  .play-button {
    font-size: 11px;
    padding: 11px 13px;
  }
  .toggle {
    font-size: 10px;
  }
  .loh-name {
    font-size: 31px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .toggle-track:after {
    transition: none;
  }
}
.loh-room-pieces {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.loh-throne {
  position: absolute;
  width: 68%;
  height: 60%;
  bottom: 19%;
  left: 16%;
  opacity: 0;
  transform-origin: 50% 95%;
}
.loh-curtain {
  position: absolute;
  width: 30%;
  height: 67%;
  top: 11%;
  opacity: 0;
  transform-origin: 50% 0;
}
.loh-curtain-left {
  left: -2%;
}
.loh-curtain-right {
  right: -2%;
}
.loh-throne img,
.loh-curtain img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.loh-throne img {
  object-position: 50% 100%;
}
.loh-curtain img {
  object-position: 50% 0;
}
.loh-curtain-right img {
  transform: scaleX(-1);
}
.loh-static .loh-throne,
.loh-static .loh-curtain {
  opacity: 1;
}

.loh-seated {
  position: absolute;
  left: 12%;
  width: 76%;
  height: 70%;
  bottom: 18%;
  opacity: 0;
  transform-origin: 50% 96%;
}
.loh-seated-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
  display: block;
}
.loh-seat-flash {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: radial-gradient(
    ellipse at 46% 42%,
    #cfb489 0%,
    #ac8db1 36%,
    #806195 68%,
    #503c66 100%
  );
  opacity: 0;
  pointer-events: none;
}
.loh-static .loh-figure,
.loh-static .loh-throne {
  opacity: 0;
}
.loh-static .loh-seated {
  opacity: 1;
}
`,n=`.lab-header-links {
  display: flex;
  align-items: center;
  gap: 23px;
}
.lab-header-links > a {
  font-size: 10px;
  color: #cbb994;
}
.scene-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 24px;
}
.scene-tabs button {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  border: 1px solid #b49b7427;
  border-radius: 7px;
  background: #ffffff02;
  padding: 13px 15px;
  color: #aaa197;
  font-size: 11px;
  text-align: left;
}
.scene-tabs button span {
  font-size: 9px;
  color: #8e8071;
}
.scene-tabs button[aria-pressed='true'] {
  background: #d8b97912;
  border-color: #d8b97966;
  color: #eadbc4;
}
.scene-tabs button[aria-pressed='true'] span {
  color: #d8b979;
}
.ceremony-lab .workspace {
  padding-top: 24px;
  gap: 64px;
}
.ceremony-lab .transport {
  gap: 10px;
}
.pause-button {
  padding: 10px 1px;
  border: 0;
  background: none;
  color: #c6bba9;
  font-size: 11px;
}
.ceremony-lab .scene-mount {
  z-index: 4;
}
.ceremony-lab .notes-column {
  padding-top: 12px;
}
.ceremony-lab .notes-column h2 {
  font-size: 35px;
}
.ceremony-lab .stage-idle h1 {
  max-width: 82%;
  font-size: 49px;
}
.gallery-stage[data-ceremony='safety'] {
  background: radial-gradient(ellipse at 50% 44%, #263e59, #181e2d 47%, #11131d 80%);
}
.gallery-stage[data-ceremony='nominations'] {
  background: radial-gradient(ellipse at 50% 67%, #481c28, #20151e 46%, #100e15 80%);
}
.gallery-stage[data-ceremony='save'] {
  background: radial-gradient(ellipse at 50% 45%, #27383b, #1b202b 50%, #11121b 80%);
}
.gallery-stage[data-ceremony='exit'] {
  background: radial-gradient(ellipse at 50% 48%, #312738, #191621 50%, #100e16 80%);
}
.c-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.c-scene img {
  display: block;
  pointer-events: none;
}
.c-caption {
  position: absolute;
  bottom: 8%;
  left: 5%;
  right: 5%;
  text-align: center;
  opacity: 0;
  z-index: 7;
}
.c-caption > span {
  display: block;
  color: #d9c492;
  font-size: 8px;
  letter-spacing: 0.21em;
  margin-bottom: 7px;
}
.c-caption > strong {
  display: block;
  font-family: Georgia, serif;
  font-size: 32px;
  line-height: 1.1;
  font-weight: 400;
  letter-spacing: -0.035em;
  color: #f0e4ce;
}
.c-caption > em {
  display: block;
  color: #cdb993;
  font-size: 7px;
  letter-spacing: 0.15em;
  font-style: normal;
  margin-top: 9px;
  line-height: 1.6;
}
.c-halo {
  position: absolute;
  left: 7%;
  top: 12%;
  width: 86%;
  height: 68%;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
}
.c-ground {
  position: absolute;
  bottom: 23%;
  left: 18%;
  width: 64%;
  height: 6%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #cfba7945, transparent 70%);
  opacity: 0;
}
.c-hero {
  position: absolute;
  left: 15%;
  width: 70%;
  height: 70%;
  bottom: 23%;
  object-fit: contain;
  object-position: 50% 100%;
  opacity: 0;
  transform-origin: 50% 94%;
}
.c-wash {
  position: absolute;
  inset: 0;
  z-index: 6;
  background: radial-gradient(ellipse at 46% 42%, #c8ad83, #9b8aa9 38%, #675d88 72%, #37415d);
  opacity: 0;
}
.safety-halo {
  background: radial-gradient(ellipse, #7295b854, #52668923 50%, transparent 70%);
}
.safety-arch {
  position: absolute;
  left: 16%;
  top: 13%;
  height: 62%;
  width: 68%;
  border: 1px solid #d5b57745;
  border-radius: 47% 47% 5% 5%;
  box-shadow: inset 0 0 0 8px #d3b98b05;
  opacity: 0;
}
.safety-ordinary {
  z-index: 2;
}
.safety-knight {
  z-index: 3;
}
.safety-flying-shield {
  position: absolute;
  left: 55%;
  top: 40%;
  width: 24%;
  height: 24%;
  object-fit: contain;
  opacity: 0;
  z-index: 4;
  transform-origin: 50% 50%;
}
.nom-chasm {
  position: absolute;
  inset: 26% 0 0;
  background:
    radial-gradient(ellipse at 50% 70%, #b7283f32, transparent 65%),
    linear-gradient(0deg, #08080fd9, transparent 80%);
  opacity: 0;
}
.nom-warning {
  position: absolute;
  top: 11%;
  left: 5%;
  right: 5%;
  text-align: center;
  color: #d7b1a5;
  font-size: 7px;
  letter-spacing: 0.19em;
  opacity: 0;
}
.nom-pod {
  position: absolute;
  top: 17%;
  width: 44%;
  height: 62%;
  opacity: 0;
  transform-origin: 50% 70%;
}
.nom-first {
  left: 3%;
}
.nom-second {
  right: 3%;
}
.nom-person {
  position: absolute;
  bottom: 26%;
  left: 0;
  width: 100%;
  height: 82%;
  object-fit: contain;
  object-position: 50% 100%;
  z-index: 2;
}
.nom-platform {
  position: absolute;
  left: -2%;
  bottom: 10%;
  width: 104%;
  height: 28%;
  object-fit: contain;
  object-position: 50% 0;
  z-index: 3;
}
.nom-aura {
  position: absolute;
  top: 0;
  bottom: 13%;
  left: 3%;
  right: 3%;
  background: radial-gradient(ellipse, #cf3b4c38, transparent 68%);
  opacity: 0;
}
.nom-label {
  position: absolute;
  bottom: 0;
  left: 4%;
  right: 4%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 7px;
  color: #efb9b1;
  font-size: 7px;
  letter-spacing: 0.13em;
}
.nom-label span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  border: 1px solid #d679774d;
  border-radius: 100%;
  font-size: 7px;
  letter-spacing: 0;
}
.c-nominations .c-caption {
  bottom: 7.8%;
}
.c-nominations .c-caption > strong {
  font-size: 29px;
}
.c-nominations .c-caption > span {
  color: #c48d87;
}
.save-danger-halo {
  background: radial-gradient(ellipse, #ac233f52, transparent 68%);
}
.save-safe-halo {
  background: radial-gradient(ellipse, #bba15b38, #5a9a9a25 47%, transparent 70%);
}
.save-person {
  z-index: 3;
  height: 62%;
  bottom: 25.5%;
}
.save-platform {
  position: absolute;
  width: 62%;
  left: 19%;
  height: 14%;
  bottom: 17.5%;
  object-fit: contain;
  object-position: 50% 0;
  opacity: 0;
  z-index: 4;
}
.save-shield {
  position: absolute;
  left: 19%;
  top: 25%;
  width: 62%;
  height: 47%;
  object-fit: contain;
  opacity: 0;
  z-index: 2;
}
.save-bracket {
  position: absolute;
  top: 13%;
  height: 60%;
  width: 15%;
  border-top: 2px solid #e28d8c;
  border-bottom: 2px solid #e28d8c;
  opacity: 0;
  z-index: 4;
}
.save-bracket-left {
  left: 16%;
  border-left: 2px solid #e28d8c;
  border-radius: 14px 0 0 14px;
}
.save-bracket-right {
  right: 16%;
  border-right: 2px solid #e28d8c;
  border-radius: 0 14px 14px 0;
}
.save-danger-caption > strong {
  font-size: 31px;
}
.save-danger-caption > em {
  color: #d89592;
}
.save-safe-caption > strong {
  font-size: 37px;
}
.save-safe-caption > span {
  color: #d9cf9c;
}
.save-ground {
  bottom: 26.2%;
}
.exit-room-light {
  position: absolute;
  inset: 10% 1% 8%;
  background: radial-gradient(ellipse at 50% 40%, #71588340, transparent 69%);
  opacity: 0;
}
.exit-door-set {
  position: absolute;
  width: 72%;
  height: 68%;
  left: 14%;
  bottom: 22%;
}
.exit-void {
  position: absolute;
  left: 15%;
  right: 15%;
  top: 7%;
  bottom: 4%;
  border-radius: 12px 12px 1px 1px;
  background: #030309;
}
.exit-door-front {
  z-index: 3;
  perspective: 720px;
  opacity: 0;
}
.exit-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  z-index: 2;
}
.exit-leaf {
  position: absolute;
  left: 15.6%;
  width: 68.8%;
  top: 7%;
  bottom: 4%;
  transform-origin: 0 50%;
  transform: rotateY(-88deg);
  backface-visibility: hidden;
  background: linear-gradient(90deg, #17121b, #382e3b 45%, #211925);
  border: 1px solid #b9a47a7d;
  border-radius: 10px 10px 1px 1px;
  box-shadow: inset 0 0 0 8px #0002;
  z-index: 1;
}
.exit-leaf:before {
  content: '';
  position: absolute;
  left: 17%;
  right: 17%;
  top: 12%;
  bottom: 12%;
  border: 1px solid #b5a17b30;
  border-radius: 26% 26% 4px 4px;
}
.exit-leaf-emblem {
  position: absolute;
  top: 32%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 28px;
  color: #c8b48280;
}
.exit-handle {
  position: absolute;
  right: 12%;
  top: 54%;
  width: 5px;
  height: 27px;
  border-radius: 4px;
  background: linear-gradient(90deg, #90713e, #d6bf89, #8f713e);
}
.exit-traveler {
  position: absolute;
  width: 76%;
  height: 70%;
  left: 3%;
  bottom: 26%;
  object-fit: contain;
  object-position: 50% 100%;
  transform-origin: 50% 100%;
  opacity: 0;
}
.exit-near {
  z-index: 4;
}
.exit-far-wrap {
  position: absolute;
  inset: 0;
  clip-path: inset(15% 24% 26% 25% round 9px);
  z-index: 2;
}
.exit-far {
  z-index: 1;
}
.exit-sign {
  position: absolute;
  top: 7%;
  left: 0;
  right: 0;
  text-align: center;
  color: #cdb88c;
  font-size: 8px;
  letter-spacing: 0.24em;
  opacity: 0;
  z-index: 5;
}
.c-exit .c-caption {
  z-index: 5;
}
.exit-blackout {
  position: absolute;
  inset: 0;
  background: #05040a;
  z-index: 9;
  opacity: 0;
}
/* Still comparisons show the representative final pose; no active animations. */
.c-static .c-caption,
.c-static .c-halo,
.c-static .c-ground,
.c-static .safety-knight,
.c-static .safety-arch,
.c-static .nom-pod,
.c-static .nom-chasm,
.c-static .nom-warning,
.c-static .save-person,
.c-static .save-safe-halo,
.c-static .save-safe-caption,
.c-static .exit-door-front,
.c-static .exit-sign {
  opacity: 1;
}
.c-static .nom-aura {
  opacity: 0.5;
}
.c-static .save-shield {
  opacity: 0.9;
}
.c-static .save-danger-caption,
.c-static .save-danger-halo {
  opacity: 0;
}
.c-static .exit-leaf {
  transform: rotateY(0);
}
.c-static.c-exit .c-caption {
  opacity: 1;
}
@media (max-width: 800px) {
  .ceremony-lab .workspace {
    gap: 30px;
  }
  .scene-tabs button {
    padding: 12px 10px;
    gap: 8px;
  }
  .lab-header-links {
    gap: 15px;
  }
  .ceremony-lab .notes-column h2 {
    font-size: 29px;
  }
}
@media (max-width: 620px) {
  .scene-tabs {
    gap: 6px;
    margin-top: 19px;
  }
  .scene-tabs button {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 9px;
    font-size: 10px;
  }
  .ceremony-lab .workspace {
    padding-top: 20px;
  }
  .lab-header-links {
    flex-direction: column;
    align-items: flex-end;
    gap: 7px;
  }
  .lab-header-links > a {
    font-size: 9px;
  }
  .ceremony-lab .stage-idle h1 {
    font-size: 43px;
  }
  .ceremony-lab .notes-column {
    padding-top: 28px;
  }
  .ceremony-lab .notes-column h2 {
    font-size: 32px;
  }
  .ceremony-lab .transport {
    gap: 9px;
  }
  .pause-button {
    font-size: 10px;
  }
  .c-caption > strong {
    font-size: 29px;
  }
  .c-nominations .c-caption > strong {
    font-size: 27px;
  }
  .save-safe-caption > strong {
    font-size: 35px;
  }
}

.gallery-stage[data-ceremony='tiebreak'] {
  background: radial-gradient(ellipse at 50% 48%, #49351d, #211a19 51%, #100f16 82%);
}
.gallery-stage[data-ceremony='ambush'] {
  background: radial-gradient(ellipse at 50% 44%, #48202b, #20151f 48%, #100e16 80%);
}
.gallery-stage[data-ceremony='allPower'] {
  background: radial-gradient(ellipse at 50% 47%, #4c3a25, #211b26 50%, #100e16 82%);
}
.gallery-stage[data-ceremony='shock'] {
  background: radial-gradient(ellipse at 50% 48%, #35294b, #1d1828 50%, #100e16 82%);
}
.gallery-stage[data-ceremony='final4'] {
  background: radial-gradient(ellipse at 50% 52%, #283647, #1c1c2a 50%, #100e16 82%);
}
.gallery-stage[data-ceremony='final3'] {
  background: radial-gradient(ellipse at 50% 45%, #433523, #211a24 50%, #100e16 82%);
}
.shock-picker {
  margin: 16px 0 4px;
  padding: 12px;
  border: 1px solid #d8b97926;
  border-radius: 8px;
  background: #ffffff04;
}
.shock-picker label {
  display: block;
  margin: 0 0 7px;
  color: #cbb994;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.shock-picker select {
  width: 100%;
  padding: 10px;
  border: 1px solid #b49b7440;
  border-radius: 6px;
  background: #17151e;
  color: #eadbc4;
  font: inherit;
  font-size: 12px;
}
.shock-picker[hidden] {
  display: none;
}
.tie-halo {
  position: absolute;
  inset: 14% 8% 28%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d7b76022, transparent 68%);
  opacity: 0;
}
.tie-scales {
  position: absolute;
  z-index: 2;
  left: 28%;
  top: 14%;
  width: 44%;
  height: 42%;
  object-fit: contain;
  opacity: 0;
  transform-origin: 50% 47%;
}
.tie-candidate {
  position: absolute;
  z-index: 2;
  top: 34%;
  width: 31%;
  height: 44%;
  opacity: 0;
}
.tie-left {
  left: 2%;
}
.tie-right {
  right: 2%;
}
.tie-person {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
}
.tie-candidate > span {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  color: #d1bd91;
  font-size: 7px;
  letter-spacing: 0.14em;
}
.tie-candidate > strong {
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 7px;
  border-radius: 100%;
  background: #211a1e;
  color: #d4bd7f;
  font-size: 9px;
}
.tie-token {
  position: absolute;
  z-index: 4;
  left: 47%;
  top: 19%;
  width: 18%;
  height: 12%;
  display: grid;
  place-content: center;
  border: 1px solid #d9bb75;
  border-radius: 100%;
  background: radial-gradient(circle, #806234, #2e2130 68%);
  box-shadow: 0 0 20px #d2ad5833;
  color: #f2deb0;
  text-align: center;
  font-size: 7px;
  line-height: 1.25;
  letter-spacing: 0.08em;
  opacity: 0;
}
.tie-vote-line {
  position: absolute;
  left: 50%;
  top: 20%;
  height: 34%;
  border-left: 1px solid #d3b76835;
  opacity: 0;
}
.ambush-curtains {
  position: absolute;
  inset: 0;
  z-index: 5;
  overflow: hidden;
}
.ambush-curtain {
  position: absolute;
  top: 8%;
  height: 70%;
  width: 22%;
  object-fit: fill;
  opacity: 0.96;
}
.ambush-curtain-left {
  left: 0;
  transform-origin: left center;
}
.ambush-curtain-right {
  right: 0;
  transform: scaleX(-1);
  transform-origin: right center;
}
.ambush-side-nominees {
  position: absolute;
  z-index: 1;
  left: 5%;
  right: 5%;
  top: 33%;
  height: 31%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  opacity: 0;
}
.ambush-small {
  height: 100%;
  width: 30%;
  object-fit: contain;
  filter: brightness(0.43) saturate(0.72);
}
.ambush-side-nominees > span {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -12%;
  text-align: center;
  color: #cb9a90;
  font-size: 7px;
  letter-spacing: 0.18em;
}
.ambush-beam {
  position: absolute;
  z-index: 1;
  top: 11%;
  left: 32%;
  width: 36%;
  height: 59%;
  background: linear-gradient(180deg, #f0d37d15, #d92d4526 65%, transparent);
  clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
  transform-origin: top;
  opacity: 0;
}
.ambush-platform {
  position: absolute;
  z-index: 2;
  left: 31%;
  bottom: 20%;
  width: 38%;
  height: 22%;
  object-fit: contain;
  opacity: 0;
}
.ambush-target {
  position: absolute;
  z-index: 3;
  left: 30%;
  bottom: 24%;
  width: 40%;
  height: 56%;
  object-fit: contain;
  object-position: 50% 100%;
  opacity: 0;
}
.ambush-stamp {
  position: absolute;
  z-index: 6;
  top: 13%;
  left: 50%;
  width: 116px;
  padding: 8px 5px;
  border: 1px solid #e09992a0;
  background: #331923df;
  color: #f0c8bc;
  text-align: center;
  font-size: 8px;
  line-height: 1.4;
  letter-spacing: 0.2em;
  transform: translateX(-50%);
  opacity: 0;
}
.ambush-stamp b {
  color: #ffd9a0;
}
.power-aura {
  position: absolute;
  inset: 6% 10% 12%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #e2be6d36, #8b6bb01c 48%, transparent 72%);
  opacity: 0;
}
.power-eye {
  position: absolute;
  z-index: 1;
  left: 25%;
  top: 9%;
  width: 50%;
  height: 37%;
  object-fit: contain;
  opacity: 0;
}
.power-king {
  position: absolute;
  z-index: 2;
  left: 18%;
  bottom: 20%;
  width: 64%;
  height: 73%;
  object-fit: contain;
  object-position: 50% 100%;
  opacity: 0;
}
.power-shield {
  position: absolute;
  z-index: 3;
  right: 10%;
  top: 40%;
  width: 29%;
  height: 31%;
  object-fit: contain;
  opacity: 0;
}
.power-label {
  position: absolute;
  z-index: 4;
  left: 7%;
  right: 7%;
  top: 14%;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
  color: #f0d99f;
  font-size: 6px;
  letter-spacing: 0.12em;
  opacity: 0;
}
.power-label b {
  font-size: 15px;
  color: #f2dfa9;
}
.shock-curtains {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
}
.shock-curtain {
  position: absolute;
  top: 9%;
  height: 66%;
  width: 21%;
  object-fit: fill;
  opacity: 0.9;
}
.shock-curtain-left {
  left: 0;
  transform-origin: left center;
}
.shock-curtain-right {
  right: 0;
  transform: scaleX(-1);
  transform-origin: right center;
}
.shock-rays {
  position: absolute;
  left: 16%;
  right: 16%;
  top: 10%;
  height: 50%;
  background: repeating-conic-gradient(
    from 0deg at 50% 43%,
    #d9ba7330 0deg 3deg,
    transparent 3deg 12deg
  );
  mask-image: radial-gradient(ellipse, #000 0%, transparent 69%);
  opacity: 0;
}
.shock-eye {
  position: absolute;
  z-index: 3;
  left: 30%;
  top: 13%;
  width: 40%;
  height: 27%;
  object-fit: contain;
  opacity: 0;
  filter: drop-shadow(0 0 16px #c4a44d43);
}
.shock-card {
  position: absolute;
  z-index: 5;
  left: 8%;
  right: 8%;
  top: 43%;
  padding: 15px 8px 16px;
  border-top: 1px solid #d5bd7a70;
  border-bottom: 1px solid #d5bd7a70;
  background: linear-gradient(90deg, transparent, #1a1520e8 17%, #1a1520e8 83%, transparent);
  text-align: center;
  opacity: 0;
}
.shock-card > span {
  display: block;
  color: #d3bc7c;
  font-size: 6px;
  letter-spacing: 0.22em;
}
.shock-title {
  display: block;
  margin-top: 8px;
  color: #f0e0bc;
  font:
    400 22px Georgia,
    serif;
  letter-spacing: 0.03em;
}
.shock-copy {
  display: block;
  margin-top: 7px;
  color: #c7b9a4;
  font-size: 8px;
  letter-spacing: 0.1em;
  font-style: normal;
}
.c-shock[data-shock='danger'] .shock-card {
  border-color: #ce7774aa;
}
.c-shock[data-shock='danger'] .shock-title {
  color: #f0b4a8;
}
.c-shock[data-shock='dawn'] .shock-card {
  border-color: #dba77d99;
}
.c-shock[data-shock='dawn'] .shock-title {
  color: #f2c39a;
}
.c-shock[data-shock='gold'] .shock-card {
  border-color: #d9bd6eaa;
}
.c-shock[data-shock='gold'] .shock-title {
  color: #f3d78e;
}
.c-shock[data-shock='storm'] .shock-rays {
  filter: hue-rotate(205deg);
  opacity: 0.45;
}
.c-shock[data-shock='rose'] .shock-card {
  border-color: #d688a399;
}
.c-shock[data-shock='rose'] .shock-title {
  color: #eeb5c2;
}
.f4-arch,
.f3-arch {
  position: absolute;
  left: 14%;
  top: 14%;
  width: 72%;
  height: 56%;
  border: 1px solid #d4bd7855;
  border-bottom: 0;
  border-radius: 48% 48% 0 0;
  box-shadow: inset 0 0 0 7px #d5bd7808;
  opacity: 0;
}
.f4-eligible {
  position: absolute;
  z-index: 4;
  top: 8%;
  left: 4%;
  right: 4%;
  text-align: center;
  color: #c9bb9a;
  font-size: 6px;
  letter-spacing: 0.12em;
  opacity: 0;
}
.f4-row {
  position: absolute;
  z-index: 2;
  left: 4%;
  right: 4%;
  top: 22%;
  height: 56%;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
}
.f4-player {
  position: relative;
  width: 32%;
  height: 100%;
  opacity: 0;
}
.f4-person {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
}
.f4-player > span {
  position: absolute;
  bottom: -1px;
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #d4bd7b66;
  background: #1a1b25;
  color: #ead8a8;
  font-size: 7px;
}
.f4-ballot {
  position: absolute;
  z-index: 5;
  left: 43%;
  top: 20%;
  width: 14%;
  height: 12%;
  display: grid;
  place-content: center;
  border: 1px solid #e1c579;
  border-radius: 3px;
  background: linear-gradient(145deg, #c8a55b, #634727);
  box-shadow: 0 0 20px #e2c86e66;
  color: #fff0c7;
  text-align: center;
  font-size: 5px;
  letter-spacing: 0.12em;
  line-height: 1.25;
  opacity: 0;
}
.f4-result {
  position: absolute;
  z-index: 5;
  left: 0;
  right: 0;
  bottom: 24%;
  color: #efc3a2;
  text-align: center;
  font-size: 7px;
  letter-spacing: 0.18em;
  opacity: 0;
}
.f3-title {
  position: absolute;
  z-index: 1;
  top: 8%;
  left: 0;
  right: 0;
  color: #e3d1a5;
  text-align: center;
  font-size: 8px;
  letter-spacing: 0.2em;
  opacity: 0;
}
.f3-player {
  position: absolute;
  z-index: 2;
  top: 22%;
  height: 55%;
  width: 35%;
  opacity: 0;
}
.f3-person {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: 50% 100%;
}
.f3-loh {
  left: 32%;
  top: 18%;
  height: 59%;
  z-index: 3;
}
.f3-left {
  left: -1%;
  top: 26%;
  height: 50%;
}
.f3-right {
  right: -1%;
  top: 26%;
  height: 50%;
}
.f3-player > span {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  color: #d8c696;
  font-size: 6px;
  letter-spacing: 0.15em;
}
.f3-crown {
  position: absolute;
  z-index: 3;
  left: 38%;
  top: 15%;
  width: 24%;
  height: 8%;
  object-fit: contain;
  opacity: 0;
}
.f3-decree {
  position: absolute;
  z-index: 5;
  top: 33%;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 12px;
  border: 1px solid #d6b867a0;
  background: #201a22ed;
  color: #f4dda0;
  text-align: center;
  font-size: 7px;
  line-height: 1.5;
  letter-spacing: 0.16em;
  opacity: 0;
}
.f3-door {
  position: absolute;
  z-index: 4;
  right: 1%;
  top: 20%;
  width: 27%;
  height: 57%;
  object-fit: contain;
  opacity: 0;
}
.f3-last-two {
  position: absolute;
  z-index: 6;
  bottom: 22%;
  left: 0;
  right: 0;
  text-align: center;
  color: #f0d897;
  font:
    400 16px Georgia,
    serif;
  letter-spacing: 0.1em;
  opacity: 0;
}
.f3-blackout {
  position: absolute;
  z-index: 5;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 30%, #09070dbb 100%);
  opacity: 0;
  pointer-events: none;
}
.c-static .tie-halo,
.c-static .tie-scales,
.c-static .tie-candidate,
.c-static .ambush-side-nominees,
.c-static .ambush-target,
.c-static .ambush-platform,
.c-static .power-aura,
.c-static .power-eye,
.c-static .power-king,
.c-static .power-shield,
.c-static .shock-eye,
.c-static .shock-card,
.c-static .f4-arch,
.c-static .f4-player,
.c-static .f4-result,
.c-static .f3-arch,
.c-static .f3-player,
.c-static .f3-door,
.c-static .f3-last-two {
  opacity: 1;
}
.c-static .tie-token,
.c-static .f4-ballot {
  opacity: 1;
}
.c-static .f3-right {
  opacity: 0;
}
.c-static .f3-last-two {
  opacity: 1;
}
@media (max-width: 620px) {
  .scene-tabs {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .scene-tabs button {
    font-size: 9px;
    padding: 8px 6px;
  }
  .shock-title {
    font-size: 17px;
  }
  .shock-picker {
    margin-top: 12px;
  }
  .power-label {
    gap: 5px;
    font-size: 5px;
  }
  .f4-eligible {
    font-size: 5px;
  }
}
.f3-crown {
  top: 39%;
}
`,r=`.cinema-v2 {
  background: #100e15;
}
.cinema-v2 img {
  display: block;
}
.cine-shot,
.cine-world {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
}
.cine-shot {
  opacity: 0;
}
.cine-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cine-person {
  position: absolute;
  aspect-ratio: 2/3;
  z-index: 3;
  transform-origin: 50% 95%;
}
.cine-body {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
  object-fit: contain;
}
.cine-contact {
  position: absolute;
  z-index: 1;
  bottom: 1%;
  left: 24%;
  width: 52%;
  height: 4%;
  border-radius: 50%;
  background: #07040bd4;
  filter: blur(3px);
}
.role-left {
  width: 50%;
  left: -2%;
  bottom: 33%;
}
.role-right {
  width: 50%;
  right: -2%;
  bottom: 33%;
}
.role-center {
  width: 49%;
  left: 25.5%;
  bottom: 32%;
}
.cine-voting {
  position: absolute;
  left: 31%;
  bottom: 21%;
  width: 38%;
  aspect-ratio: 2/3;
  z-index: 5;
}
.cine-console {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.cine-token {
  position: absolute;
  width: 18%;
  left: 41%;
  top: 12%;
  height: auto;
  z-index: 3;
}
.cine-token-light {
  position: absolute;
  top: 11%;
  left: 34%;
  width: 32%;
  height: 9%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d4ad603f, transparent 72%);
  opacity: 0;
  z-index: 4;
}
.cine-verdict {
  position: absolute;
  z-index: 4;
  left: 58%;
  right: 0;
  top: 22%;
  height: 46%;
  background:
    linear-gradient(90deg, transparent, #9b253f35),
    radial-gradient(ellipse at 55% 80%, #bc334c42, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.cine-atmosphere {
  position: absolute;
  z-index: 8;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  opacity: 0.2;
}
.cine-grade {
  position: absolute;
  z-index: 9;
  inset: 0;
  background:
    linear-gradient(0deg, #08070ee8 0%, #08070e75 17%, transparent 38%, transparent 83%, #09071070),
    radial-gradient(ellipse at 50% 44%, transparent 35%, #0b071143 100%);
  pointer-events: none;
}
.cine-letterbox {
  position: absolute;
  left: 0;
  right: 0;
  height: 4.1%;
  background: #08070c;
  z-index: 15;
}
.letterbox-top {
  top: 0;
}
.letterbox-bottom {
  bottom: 0;
}
.cine-sequence {
  position: absolute;
  bottom: 2%;
  left: 0;
  right: 0;
  z-index: 16;
  color: #c3b199;
  font-size: 5px;
  letter-spacing: 0.25em;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
}
.cine-sequence i {
  width: 24px;
  height: 1px;
  background: #a68c60;
}
.cinema-v2 ~ * {
  pointer-events: none;
}
.cine-titles {
  position: absolute;
  z-index: 12;
  left: 6%;
  right: 6%;
  bottom: 8.5%;
  text-align: center;
  color: #f4e7ce;
  opacity: 0;
  text-shadow: 0 2px 18px #0008;
}
.cine-titles > span {
  display: block;
  font-size: 6px;
  letter-spacing: 0.22em;
  line-height: 1.7;
  color: #dac49b;
}
.cine-titles h3 {
  font-family: Georgia, serif;
  font-size: 31px;
  font-weight: 400;
  line-height: 1.06;
  letter-spacing: -0.025em;
  margin: 8px 0 0;
}
.cine-titles p {
  font-size: 6px;
  letter-spacing: 0.14em;
  line-height: 1.8;
  color: #c7b49a;
  margin: 9px 0 0;
}
.cine-titles > i {
  display: block;
  height: 1px;
  width: 29px;
  background: #c8ad73;
  margin: 13px auto 0;
}
.cine-cut {
  position: absolute;
  inset: -3%;
  z-index: 11;
  background: linear-gradient(100deg, #100d17, #2c2436 48%, #69556b 49%, #241d2b 52%, #0b0910);
  opacity: 0;
  pointer-events: none;
  transform: translateX(-130%);
}
.cine-cut i {
  position: absolute;
  left: 48%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #b6a27e80;
}
.cine-sweep {
  position: absolute;
  z-index: 10;
  inset: 0;
  width: 58%;
  background: linear-gradient(90deg, transparent, #bea27925, transparent);
  opacity: 0;
  pointer-events: none;
}
.cine-gates {
  position: absolute;
  z-index: 2;
  left: 39%;
  width: 22%;
  top: -1%;
  height: 43%;
  overflow: hidden;
}
.cine-gate {
  position: absolute;
  top: 0;
  width: 52%;
  height: 100%;
  object-fit: fill;
}
.gate-left {
  left: 0;
}
.gate-right {
  right: 0;
  transform: scaleX(-1);
}
.cine-danger {
  position: absolute;
  z-index: 2;
  inset: 2% 32% 34%;
  background: linear-gradient(180deg, #9c20351a, #c52a4b38);
  clip-path: polygon(35% 0, 65% 0, 100% 100%, 0 100%);
  mix-blend-mode: screen;
  opacity: 0;
}
.role-portrait {
  left: 22%;
  width: 87%;
  bottom: 1%;
}
.role-target {
  width: 60%;
  left: 20%;
  bottom: 35%;
}
.role-back-left {
  width: 42%;
  left: -10%;
  bottom: 43%;
  filter: brightness(0.58);
}
.role-back-right {
  width: 42%;
  right: -10%;
  bottom: 43%;
  filter: brightness(0.58);
}
.f4-left {
  width: 45%;
  left: -9%;
  bottom: 33%;
}
.f4-center {
  width: 47%;
  left: 26.5%;
  bottom: 31%;
}
.f4-right {
  width: 45%;
  right: -9%;
  bottom: 33%;
}
.cine-small-shield {
  position: absolute;
  z-index: 4;
  width: 12%;
  height: 14%;
  left: 52%;
  bottom: 35%;
  object-fit: contain;
  transform: rotate(-6deg);
}
.f3-loh {
  width: 51%;
  left: 24.5%;
  bottom: 30%;
}
.f3-survivor,
.f3-third {
  width: 43%;
  bottom: 34%;
}
.f3-survivor {
  left: -8%;
}
.f3-third {
  right: -8%;
}
.cine-crown {
  position: absolute;
  z-index: 3;
  left: 42.7%;
  top: 2.8%;
  width: 14.6%;
  height: auto;
}
.f3-finalist {
  width: 49%;
  bottom: 28%;
}
.cine-departure {
  position: absolute;
  z-index: 3;
  width: 34%;
  aspect-ratio: 2/3;
  left: 33%;
  bottom: 37%;
  transform-origin: 50% 100%;
  opacity: 0;
}
.cine-rear {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.cine-throne {
  position: absolute;
  z-index: 2;
  left: 11%;
  width: 78%;
  height: 72%;
  bottom: 14%;
  object-fit: contain;
  object-position: center bottom;
}
.cine-royal {
  position: absolute;
  z-index: 3;
  left: 15%;
  width: 70%;
  aspect-ratio: 2/3;
  bottom: 9%;
}
.cine-seated {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.cine-royal-crown {
  position: absolute;
  z-index: 4;
  width: 17%;
  height: auto;
  left: 41.5%;
  top: 5%;
}
.cine-royal-shield {
  position: absolute;
  z-index: 4;
  left: 67%;
  width: 20%;
  height: 24%;
  bottom: 16%;
  object-fit: contain;
  transform: rotate(-8deg);
}
.film-allPower .shot-wide .cine-world {
  transform: scale(1.85);
  transform-origin: 50% 28%;
}
.film-allPower .shot-detail .cine-world {
  transform: scale(1);
}
.film-tiebreak .shot-detail .cine-bg,
.film-final4 .shot-detail .cine-bg {
  filter: brightness(0.45);
  transform: scale(1.15);
}
.film-tiebreak .shot-detail .cine-voting,
.film-final4 .shot-detail .cine-voting {
  width: 105%;
  left: -2.5%;
  bottom: -25%;
}
.film-tiebreak .shot-detail .cine-token,
.film-final4 .shot-detail .cine-token {
  width: 20%;
  left: 40%;
  top: 13%;
}
.film-shock .shot-wide .cine-world {
  transform: scale(1.9);
  transform-origin: 50% 27%;
}
.film-shock .shot-detail .cine-world {
  transform: scale(1.02);
}
.film-shock .cine-titles {
  bottom: 14%;
}
.film-shock .cine-titles h3 {
  font-size: 28px;
  letter-spacing: 0.03em;
}
.film-shock .cine-titles p {
  font-size: 9px;
  letter-spacing: 0.035em;
  text-transform: none;
}
.cine-eye-bloom {
  position: absolute;
  left: 38%;
  top: 19%;
  width: 24%;
  height: 16%;
  background: radial-gradient(ellipse, #cfb68150, #a27bda1a, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.film-shock[data-shock='danger'] .cine-eye-bloom {
  background: radial-gradient(ellipse, #d8596055, transparent 72%);
}
.film-shock[data-shock='storm'] .cine-world {
  filter: saturate(0.35);
}
.film-shock[data-shock='rose'] .cine-eye-bloom {
  background: radial-gradient(ellipse, #da91bc55, transparent 72%);
}
.film-final3 .shot-detail .cine-bg {
  transform: scale(1.04);
  transform-origin: 50% 40%;
}
.film-final3 .shot-detail .f3-finalist {
  filter: brightness(0.8);
}
.film-ambush .cine-titles h3 {
  font-size: 29px;
}
.cine-layer.is-layer-hidden {
  visibility: hidden !important;
}
.cinema-v2.c-static {
  opacity: 1;
}
.cinema-v2.c-static .shot-wide {
  opacity: 1;
}
.cinema-v2.c-static .shot-detail {
  opacity: 0;
}
.cinema-v2.c-static .cine-titles {
  opacity: 1;
}
.cinema-v2.c-static .cine-cut {
  opacity: 0;
}
.cinema-v2.c-static.film-ambush .shot-wide,
.cinema-v2.c-static.film-final3 .shot-wide,
.cinema-v2.c-static.film-allPower .shot-wide,
.cinema-v2.c-static.film-shock .shot-wide {
  opacity: 0;
}
.cinema-v2.c-static.film-ambush .shot-detail,
.cinema-v2.c-static.film-final3 .shot-detail,
.cinema-v2.c-static.film-allPower .shot-detail,
.cinema-v2.c-static.film-shock .shot-detail {
  opacity: 1;
}
.cinema-v2.c-static.film-ambush .gate-left {
  transform: translateX(-105%);
}
.cinema-v2.c-static.film-ambush .gate-right {
  transform: translateX(105%) scaleX(-1);
}
.cinema-options {
  margin: 17px 0 8px;
  padding: 14px;
  border: 1px solid #c6ab7133;
  border-radius: 8px;
  background: #d5bc8105;
}
.cinema-options[hidden] {
  display: none;
}
.cinema-options > label {
  display: block;
  color: #bca786;
  letter-spacing: 0.12em;
  font-size: 9px;
  margin-bottom: 7px;
}
.cinema-options select {
  width: 100%;
  padding: 9px;
  border-radius: 5px;
  background: #17151d;
  border: 1px solid #c1aa7544;
  color: #e5d5bc;
  font-size: 11px;
}
.cinema-options > p {
  font-size: 10px;
  color: #a4988c;
  line-height: 1.6;
  margin: 8px 0 0;
}
.layer-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  font-size: 10px;
  color: #c8b79d;
}
.layer-switches label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.layer-switches input {
  accent-color: #c5ab76;
  width: 11px;
  height: 11px;
  margin: 0;
}
@media (min-width: 621px) {
  .cine-titles h3 {
    font-size: 35px;
  }
  .film-shock .cine-titles h3 {
    font-size: 31px;
  }
  .cine-titles > span {
    font-size: 7px;
  }
  .cine-titles p {
    font-size: 7px;
  }
}
@media (max-width: 360px) {
  .cine-titles h3 {
    font-size: 27px;
  }
  .cine-titles > span {
    font-size: 5px;
  }
  .film-shock .cine-titles h3 {
    font-size: 24px;
  }
}
.cine-contact {
  bottom: 4.4%;
  height: 3%;
  left: 25%;
  width: 50%;
  background: #08050ddd;
  filter: blur(2px);
}
.cine-reflection {
  position: absolute;
  left: 0;
  right: 0;
  top: 90%;
  height: 23%;
  overflow: hidden;
  opacity: 0.16;
  mask-image: linear-gradient(#0009, transparent 95%);
  z-index: 0;
  pointer-events: none;
}
.cine-reflected-body {
  width: 100%;
  height: auto;
  transform: scaleY(-1);
  transform-origin: 50% 50%;
}
.cine-person .cine-body {
  z-index: 2;
}
.cine-throne {
  left: 16%;
  width: 68%;
  height: auto;
  aspect-ratio: 2/3;
  bottom: 20%;
  object-fit: contain;
}
.cine-royal {
  left: 16%;
  width: 68%;
  bottom: 20%;
}
.cine-royal-shield {
  left: 65%;
  width: 18%;
  height: 22%;
  bottom: 25%;
}
.f4-left {
  width: 42%;
  left: -3%;
  bottom: 33%;
}
.f4-center {
  width: 45%;
  left: 27.5%;
  bottom: 31%;
}
.f4-right {
  width: 42%;
  right: auto;
  left: 61%;
  bottom: 33%;
}
.cine-outcome {
  position: absolute;
  z-index: 6;
  top: 67.5%;
  left: 65%;
  right: 3%;
  font-size: 5px;
  letter-spacing: 0.15em;
  color: #e1a59d;
  text-align: center;
  opacity: 0;
}
.film-tiebreak .cine-outcome {
  left: 59%;
  right: 6%;
}
.cine-token {
  transform: scaleY(0.5);
}
.cine-danger-ring {
  position: absolute;
  z-index: 3;
  left: 7%;
  right: 7%;
  bottom: 35.5%;
  height: 8%;
  border-radius: 50%;
  border: 1px solid #e7696a;
  background: radial-gradient(ellipse, transparent 48%, #ad2b3e33 67%, transparent 72%);
  box-shadow: 0 2px 12px #d12c4c4d;
  opacity: 0;
}
.cine-danger {
  background: linear-gradient(180deg, #9c20351a, #c52a4b55);
}
.cine-gate {
  width: 51%;
  object-fit: fill;
}
.cine-royal-shield {
  width: 17%;
  height: 19%;
  bottom: 20%;
}
`,i=`/* Revision 3: spatial entrances and explicit action. */
.cinema-v3 {
  perspective: 900px;
}
.cinema-v3 .cine-world,
.cinema-v3 .shot-detail .cine-world {
  transform: none;
  transform-origin: 50% 35%;
}
.cinema-v3.film-allPower .shot-wide .cine-world {
  transform: none;
}
.cinema-v3.film-final3 .shot-detail .cine-bg {
  transform: none;
}
.cinema-v3 .cine-titles {
  bottom: 8%;
}
.cinema-v3 .cine-titles h3 {
  font-size: 29px;
}
.cinema-v3 .cine-titles p {
  font-size: 6.5px;
  letter-spacing: 0.11em;
  max-width: 96%;
  margin: 9px auto 0;
}
.actor-badge {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: -6%;
  text-align: center;
  font-size: 5.5px;
  letter-spacing: 0.12em;
  color: #e0cda9;
  text-shadow: 0 1px 6px #000;
  white-space: nowrap;
}
.depth-entrance {
  position: absolute;
  inset: 0;
  z-index: 14;
  pointer-events: none;
}
.entrance-wing {
  position: absolute;
  top: -4%;
  bottom: -4%;
  width: 50.5%;
  background: #181019;
  box-shadow: 0 0 22px #000b;
}
.wing-left {
  left: 0;
}
.wing-right {
  right: 0;
}
.entrance-panel {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.wing-right .entrance-panel {
  transform: scaleX(-1);
}
.foreground-jamb {
  position: absolute;
  top: -5%;
  bottom: -5%;
  width: 7%;
  z-index: 13;
  background: linear-gradient(90deg, #100c13, #5c4729 30%, #c8ac705e 45%, #281c25 56%, #0c0910);
  box-shadow: 0 0 20px #0009;
  pointer-events: none;
}
.jamb-left {
  left: -2%;
}
.jamb-right {
  right: -2%;
  background: linear-gradient(90deg, #0c0910, #281c25 44%, #c8ac705e 55%, #5c4729 70%, #100c13);
}
.cinema-v3 .cine-cut {
  background: radial-gradient(ellipse at 52% 40%, #af9488, #826784 38%, #4b3c5d 72%, #201b2f);
  inset: -5%;
  z-index: 11;
  transform: none;
}
.cinema-v3 .cine-cut i {
  display: none;
}
.transition-blade {
  position: absolute;
  top: -6%;
  left: 38%;
  width: 26%;
  height: 112%;
  z-index: 12;
  opacity: 0;
  filter: blur(1px);
  box-shadow:
    -10px 0 26px #10071380,
    10px 0 26px #10071380;
  pointer-events: none;
}
.transition-texture {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.ceremony-energy {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}
.energy-ring {
  position: absolute;
  left: 11%;
  top: 15%;
  width: 78%;
  height: 53%;
  border-radius: 50%;
  border: 1px solid #d6bc9c75;
  box-shadow:
    0 0 12px #b68ac244,
    inset 0 0 10px #d6b58322;
  opacity: 0;
}
.ring-b {
  left: 4%;
  width: 92%;
  border-color: #ab8ec681;
}
.energy-core {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 45%, #d1b17e2e, #8f6db62e 30%, transparent 68%);
  opacity: 0;
}
.cine-beat {
  position: absolute;
  z-index: 13;
  top: 8.2%;
  left: 7%;
  right: 7%;
  text-align: center;
  font-size: 6.5px;
  line-height: 1.6;
  letter-spacing: 0.15em;
  color: #f0d9ad;
  text-shadow: 0 1px 6px #000;
  opacity: 0;
  padding: 7px 3px;
  background: linear-gradient(90deg, transparent, #13101b8c 25%, #13101b8c 75%, transparent);
}
.beat-action {
  color: #e7d3b5;
}
.vote-caption {
  position: absolute;
  left: -10%;
  right: -10%;
  top: 3%;
  text-align: center;
  color: #e4c88e;
  font-size: 5px;
  letter-spacing: 0.14em;
  text-shadow: 0 1px 5px #000;
}
.shot-wide .vote-caption {
  display: none;
}
.vote-tally {
  position: absolute;
  z-index: 8;
  left: 29%;
  width: 42%;
  top: 15%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  color: #ead09d;
  text-shadow: 0 2px 10px #000;
  font-size: 24px;
  font-family: Georgia, serif;
  opacity: 0;
}
.vote-tally i {
  font-size: 13px;
  font-style: normal;
  color: #a1927f;
}
.tally-after b:last-child {
  color: #ec9e9b;
}
.vote-flight {
  position: absolute;
  z-index: 8;
  left: 46.5%;
  top: 51%;
  width: 7%;
  height: auto;
  opacity: 0;
  filter: drop-shadow(0 0 7px #e2c46e80);
}
.verdict-trail {
  position: absolute;
  z-index: 7;
  left: 49%;
  top: 51%;
  height: 1px;
  width: 28%;
  background: linear-gradient(90deg, #cfb16600, #d8c17b, #d1787f);
  box-shadow: 0 0 8px #d6ad7c70;
  transform-origin: left;
  opacity: 0;
}
.verdict-bracket {
  position: absolute;
  z-index: 5;
  left: 62%;
  right: 3%;
  top: 23%;
  height: 42%;
  border-radius: 45% 45% 2px 2px;
  background: radial-gradient(ellipse at 50% 90%, #b724383b, transparent 72%);
  opacity: 0;
  transform-origin: 50% 100%;
}
.verdict-bracket > i {
  position: absolute;
  top: 3%;
  bottom: 0;
  width: 14%;
  border-top: 1px solid #cf8682;
  border-bottom: 1px solid #cf8682;
}
.verdict-bracket > i:first-child {
  left: 0;
  border-left: 1px solid #cf8682;
  border-radius: 10px 0 0 2px;
}
.verdict-bracket > i:nth-child(2) {
  right: 0;
  border-right: 1px solid #cf8682;
  border-radius: 0 10px 2px 0;
}
.verdict-bracket > span {
  position: absolute;
  top: 106%;
  left: 0;
  right: 0;
  text-align: center;
  color: #e6b0a8;
  font-size: 5.5px;
  letter-spacing: 0.12em;
}
.film-final4 .tally-after {
  top: 14.5%;
  left: 37%;
  width: 26%;
  font-size: 22px;
  gap: 13px;
}
.film-final4 .verdict-bracket {
  left: 64%;
  right: 3%;
  top: 25%;
  height: 40%;
}
.safety-spotlight {
  position: absolute;
  z-index: 2;
  left: 28%;
  width: 44%;
  top: 12%;
  height: 57%;
  background: radial-gradient(ellipse, #d6b56e27, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.ambush-save-shield {
  position: absolute;
  z-index: 5;
  left: 13%;
  top: 43%;
  width: 15%;
  height: 19%;
  object-fit: contain;
  opacity: 0;
}
.slot-open {
  position: absolute;
  z-index: 7;
  left: 4%;
  width: 42%;
  top: 69%;
  color: #dfc68e;
  text-align: center;
  font:
    400 13px Georgia,
    serif;
  letter-spacing: 0.08em;
  opacity: 0;
}
.slot-open > span {
  display: block;
  font:
    5px Arial,
    sans-serif;
  letter-spacing: 0.12em;
  margin-top: 5px;
}
.nomination-lock {
  position: absolute;
  z-index: 5;
  top: 17%;
  height: 46%;
  width: 8%;
  border-top: 2px solid #db8c8c;
  border-bottom: 2px solid #db8c8c;
  opacity: 0;
}
.lock-left {
  left: 21%;
  border-left: 2px solid #db8c8c;
  border-radius: 14px 0 0 3px;
}
.lock-right {
  right: 21%;
  border-right: 2px solid #db8c8c;
  border-radius: 0 14px 3px 0;
}
.cinema-v3 .role-back-left .actor-badge {
  color: #dbce9d;
}
.cinema-v3 .role-back-right .actor-badge {
  color: #d79c95;
}
.power-standing {
  width: 61%;
  left: 19.5%;
  bottom: 29%;
}
.power-award-shield {
  position: absolute;
  z-index: 5;
  left: 60%;
  top: 43%;
  width: 22%;
  height: 27%;
  object-fit: contain;
  opacity: 0;
}
.royal-group {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.royal-room-plane {
  position: absolute;
  inset: 0;
  z-index: 1;
  transform-origin: 50% 25%;
}
.royal-aura {
  position: absolute;
  z-index: 2;
  inset: 8% 8% 20%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #c6a36d2e, #9365bb15 45%, transparent 70%);
  mix-blend-mode: screen;
  opacity: 0;
}
.city-depth,
.eye-city-depth {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}
.city-plate,
.eye-city-plate {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.75) saturate(0.8);
}
.royal-window-room {
  z-index: 1;
  --royal-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1500'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H1000V1500H0Z M270 900V310C270 100 730 100 730 310V900Z'/%3E%3C/svg%3E");
  mask-image: var(--royal-mask);
  -webkit-mask-image: var(--royal-mask);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
}
.royal-glass {
  position: absolute;
  z-index: 2;
  top: 8%;
  height: 52%;
  left: 27%;
  width: 46%;
  border-radius: 45% 45% 0 0;
  background: linear-gradient(115deg, transparent 30%, #e3d1ba0c 45%, transparent 58%);
  box-shadow: inset 0 0 0 1px #b89d6540;
  overflow: hidden;
}
.royal-glass i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(90deg, #6d542b, #d4b476, #614b2c);
}
.royal-glass i:first-child {
  left: 24%;
}
.royal-glass i:last-child {
  right: 24%;
}
.city-light {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 100%;
  background: #f8d891;
  box-shadow: 0 0 5px #f8d89190;
  opacity: 0.3;
}
.city-light-a {
  left: 42%;
  top: 41%;
}
.city-light-b {
  left: 62%;
  top: 49%;
}
.eye-window-room {
  z-index: 1;
  --eye-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1500'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H1000V1500H0Z M568 400A68 68 0 1 0 432 400A68 68 0 1 0 568 400Z'/%3E%3C/svg%3E");
  mask-image: var(--eye-mask);
  -webkit-mask-image: var(--eye-mask);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
}
.eye-city-depth .eye-city-plate {
  object-position: 50% 62%;
  filter: brightness(1) saturate(0.8);
}
.eye-orbit {
  position: absolute;
  z-index: 3;
  left: 26%;
  top: 11%;
  width: 48%;
  height: 32%;
  border: 1px solid #d7bc8280;
  border-radius: 50%;
  box-shadow: 0 0 12px #ba85bb30;
  opacity: 0;
}
.orbit-b {
  left: 18%;
  top: 6%;
  width: 64%;
  height: 43%;
  border-color: #a285c890;
}
.shock-motif {
  position: absolute;
  z-index: 4;
  left: 36%;
  top: 56%;
  width: 28%;
  height: 9%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 13%;
  opacity: 0;
}
.shock-motif i {
  display: block;
  width: 25%;
  height: 75%;
  border: 1px solid #d5b77f;
  border-radius: 50%;
  background: linear-gradient(145deg, #c09c4b26, #79669d26);
  box-shadow: 0 0 10px #b9a56b1c;
}
.shock-motif b {
  display: none;
}
.cinema-v3[data-motif='twin-shields'] .shock-motif i {
  border-radius: 25% 25% 50% 50%;
  height: 90%;
}
.cinema-v3[data-motif='slashes'] .shock-motif i {
  width: 8%;
  border-radius: 0;
  transform: rotate(18deg);
  border-color: #d7968e;
  background: #a64f5b40;
}
.cinema-v3[data-motif='halo'] .shock-motif i {
  height: 20%;
  width: 65%;
  border-radius: 50%;
  transform: rotate(-15deg);
}
.cinema-v3[data-motif='halo'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='return'] .shock-motif {
  border: 1px solid #d7b981;
  border-right-color: transparent;
  border-radius: 50%;
  height: 8%;
  width: 16%;
  left: 42%;
}
.cinema-v3[data-motif='return'] .shock-motif i {
  width: 0;
  height: 0;
  border: 5px solid transparent;
  border-right: 7px solid #d7b981;
  background: none;
  position: absolute;
  left: -5px;
  top: 35%;
}
.cinema-v3[data-motif='return'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='ballots'] .shock-motif i {
  border-radius: 1px;
  transform: rotate(-8deg);
  height: 60%;
  width: 40%;
}
.cinema-v3[data-motif='storm'] .shock-motif i {
  border-radius: 50% 50% 30% 30%;
  width: 75%;
  height: 50%;
  background: #7b789044;
  border-color: #9993a0;
}
.cinema-v3[data-motif='storm'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='sunrise'] .shock-motif i {
  width: 55%;
  height: 80%;
  border-bottom: 0;
  border-radius: 50% 50% 0 0;
  background: #d6aa5430;
}
.cinema-v3[data-motif='sunrise'] .shock-motif i:nth-child(2) {
  display: none;
}
.cinema-v3[data-motif='arrows'] .shock-motif i {
  width: 70%;
  height: 1px;
  border: 0;
  background: #d596b1;
  transform: rotate(-25deg);
}
.cinema-v3[data-motif='broken-heart'] .shock-motif i {
  border-radius: 60% 60% 0 0;
  border-color: #d596b1;
  transform: rotate(-25deg);
}
.cinema-v3[data-motif='broken-heart'] .shock-motif i:nth-child(2) {
  transform: rotate(25deg);
}
.cinema-v3.film-shock .cine-titles {
  bottom: 12%;
}
.cinema-v3.film-shock .cine-titles h3 {
  font-size: 27px;
}
.cinema-v3.film-shock .cine-titles p {
  font-size: 9px;
  letter-spacing: 0.03em;
}
.final-decision {
  position: absolute;
  z-index: 7;
  top: 65%;
  left: 61%;
  width: 35%;
  padding: 7px 3px;
  text-align: center;
  color: #e9b4aa;
  font:
    400 12px Georgia,
    serif;
  opacity: 0;
  background: #36182799;
  border-top: 1px solid #bd7d7666;
  border-bottom: 1px solid #bd7d7666;
}
.final-decision > span {
  display: block;
  font:
    5px Arial,
    sans-serif;
  letter-spacing: 0.1em;
  margin-top: 4px;
}
.cinema-v3.film-final3 .cine-departure {
  width: 34%;
  left: 33%;
  bottom: 37%;
  transform-origin: 50% 100%;
  z-index: 3;
}
.doorway-volume {
  position: absolute;
  inset: 0;
  z-index: 4;
  clip-path: inset(0 39% 57.5% 39%);
  overflow: hidden;
  pointer-events: none;
}
.cinema-v3 .cine-gates {
  top: 0;
  height: 42.5%;
  left: 39%;
  width: 22%;
  z-index: 6;
}
.cinema-v3 .cine-gate {
  width: 50.5%;
  height: 100%;
  background: #261a17;
}
.portal-floor-light {
  position: absolute;
  z-index: 1;
  left: 37%;
  width: 26%;
  height: 4%;
  top: 40%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #d8b27540, transparent 75%);
}
.cinema-v3 .departure-far {
  opacity: 0;
}
.cinema-v3 .departure-near {
  opacity: 1;
}
.cinema-v3.c-static .depth-entrance,
.cinema-v3.c-static .foreground-jamb,
.cinema-v3.c-static .transition-blade,
.cinema-v3.c-static .ceremony-energy {
  display: none;
}
.cinema-v3.c-static .beat-initial,
.cinema-v3.c-static .beat-action {
  display: none;
}
.cinema-v3.c-static .tally-after,
.cinema-v3.c-static .verdict-bracket {
  opacity: 1;
}
.cinema-v3.c-static .departure-near,
.cinema-v3.c-static .departure-far {
  visibility: hidden;
}
.cinema-v3.c-static.film-final3 .gate-left {
  transform: translateX(0);
}
.cinema-v3.c-static.film-final3 .gate-right {
  transform: translateX(0) scaleX(-1);
}
.cinema-v3.c-static .royal-group {
  transform: none;
}
@media (min-width: 621px) {
  .cinema-v3 .cine-titles h3 {
    font-size: 32px;
  }
  .cine-beat {
    font-size: 7px;
  }
  .actor-badge {
    font-size: 6px;
  }
}
@media (max-width: 360px) {
  .cinema-v3 .cine-titles h3 {
    font-size: 25px;
  }
  .cinema-v3 .cine-titles p {
    font-size: 5.5px;
  }
  .cine-beat {
    font-size: 5.5px;
  }
  .actor-badge {
    font-size: 5px;
  }
  .cinema-v3.film-shock .cine-titles h3 {
    font-size: 23px;
  }
}
.cinema-v3[data-motif='pulse'] .shock-motif i {
  height: 1px;
  width: 40%;
  border: 0;
  border-radius: 0;
  background: linear-gradient(90deg, transparent, #d5bb88, transparent);
  box-shadow: 0 0 9px #c5ab7b50;
}
.cinema-v3[data-motif='pulse'] .shock-motif b {
  display: block;
  position: absolute;
  left: 48%;
  top: 46%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #dac18e;
  box-shadow: 0 0 14px #d5b67e80;
}
`,a=`/* Revision 4: shared decisions / physical exit / portrait handoff. */
.decision-film {
  background: #0a080e;
  perspective: none;
}
.decision-shot,
.decision-camera,
.exit-shot,
.exit-camera,
.avatar-sequence,
.avatar-stage {
  position: absolute;
  inset: 0;
}
.decision-camera {
  transform-origin: 54% 45%;
}
.decision-bg,
.exit-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.decision-room-dim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #06050be8;
  opacity: 0;
}
.decision-person {
  position: absolute;
  aspect-ratio: 2/3;
  transform-origin: 50% 95%;
  z-index: 3;
}
.decision-body {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: relative;
}
.decision-dark-body {
  position: absolute;
  inset: 0;
  filter: brightness(0.2) saturate(0.6);
  opacity: 0;
}
.decision-holder .decision-insignia.crown {
  left: 37%;
  top: 1.6%;
  width: 17%;
  height: auto;
}
.decision-holder .decision-insignia.shield {
  left: 22%;
  top: 48%;
  width: 24%;
  height: 28%;
}
.decision-holder.is-layer-hidden .decision-insignia:not(.is-layer-hidden) {
  visibility: visible;
}
.decision-contact {
  position: absolute;
  left: 25%;
  width: 50%;
  height: 2%;
  bottom: 4.5%;
  background: #000b;
  border-radius: 50%;
  filter: blur(2px);
}
.decision-holder {
  left: 0%;
  width: 63%;
  bottom: 10%;
  z-index: 5;
}
.decision-survivor {
  left: 25%;
  width: 43%;
  bottom: 35%;
}
.decision-evictee {
  left: 61%;
  width: 43%;
  bottom: 35%;
  z-index: 4;
}
.decision-badge {
  position: absolute;
  left: -5%;
  right: -5%;
  bottom: -3%;
  text-align: center;
  white-space: nowrap;
  color: #e6d2ae;
  font-size: 5.5px;
  letter-spacing: 0.12em;
  text-shadow: 0 2px 7px #000;
}
.decision-holder .decision-badge {
  left: -2%;
  font-size: 6px;
  bottom: 1%;
  color: #edcd8e;
}
.decision-insignia {
  position: absolute;
  z-index: 6;
  object-fit: contain;
}
.decision-insignia.crown {
  width: 12%;
  height: auto;
  left: 21%;
  top: 27%;
}
.decision-insignia.shield {
  width: 15%;
  height: 18%;
  left: 12%;
  top: 57%;
  filter: drop-shadow(0 1px 8px #040108);
}
.decision-holder-shade,
.decision-survivor-shade {
  display: none;
}
.decision-spotlight {
  position: absolute;
  z-index: 2;
  left: 61%;
  top: 7%;
  width: 43%;
  height: 62%;
  background: linear-gradient(180deg, #f2c88508, #f0c28a2b);
  clip-path: polygon(43% 0, 57% 0, 100% 100%, 0 100%);
  transform-origin: 50% 0;
  opacity: 0;
}
.decision-selection {
  position: absolute;
  z-index: 7;
  left: 67%;
  top: 22%;
  width: 30%;
  height: 40%;
  opacity: 0;
  transform-origin: 50% 100%;
}
.decision-selection i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 17%;
  border-top: 1px solid #e0b986;
  border-bottom: 1px solid #e0b986;
}
.decision-selection i:first-child {
  left: 0;
  border-left: 1px solid #e0b986;
  border-radius: 20px 0 0 3px;
}
.decision-selection i:last-child {
  right: 0;
  border-right: 1px solid #e0b986;
  border-radius: 0 20px 3px 0;
}
.decision-intro {
  position: absolute;
  z-index: 9;
  left: 6%;
  right: 6%;
  top: 8%;
  font-size: 6.5px;
  letter-spacing: 0.14em;
  text-align: center;
  color: #ecd5a8;
  text-shadow: 0 2px 8px #000;
  opacity: 0;
}
.decision-verdict {
  position: absolute;
  z-index: 9;
  left: 6%;
  right: 6%;
  bottom: 8%;
  text-align: center;
  text-shadow: 0 2px 12px #000;
  opacity: 0;
}
.decision-verdict span {
  font-size: 5.7px;
  letter-spacing: 0.15em;
  color: #c7b394;
}
.decision-verdict h3 {
  font:
    normal 33px Georgia,
    serif;
  margin: 7px 0;
  color: #f1e2cc;
}
.decision-verdict p {
  font-size: 7px;
  letter-spacing: 0.18em;
  color: #dfb793;
  margin: 0;
}
.decision-cut {
  position: absolute;
  inset: 0;
  z-index: 12;
  background: linear-gradient(120deg, #1b102a, #8c728e 48%, #ae8f68 52%, #211328);
  opacity: 0;
}
.exit-shot {
  opacity: 0;
}
.exit-camera {
  transform-origin: 50% 21.25%;
}
.decision-film .cine-departure {
  position: absolute;
  aspect-ratio: 2/3;
  width: 34%;
  left: 33%;
  bottom: 37%;
  transform-origin: 50% 100%;
  z-index: 3;
}
.decision-film .cine-rear {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.decision-film .doorway-volume {
  position: absolute;
  inset: 0;
  z-index: 4;
  clip-path: inset(0 39% 57.5% 39%);
  overflow: hidden;
}
.decision-film .cine-gates {
  top: 0;
  height: 42.5%;
  left: 39%;
  width: 22%;
  z-index: 6;
}
.decision-film .cine-gate {
  width: 50.5%;
  height: 100%;
  background: #261a17;
}
.exit-light {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    radial-gradient(ellipse at 50% 40%, #d2b57a18, transparent 45%),
    linear-gradient(0deg, #09060ebf, transparent 70%);
  pointer-events: none;
}
.exit-caption {
  position: absolute;
  z-index: 8;
  bottom: 10%;
  left: 5%;
  right: 5%;
  text-align: center;
  opacity: 0;
  text-shadow: 0 2px 9px #000;
}
.exit-caption span,
.exit-caption p {
  color: #d4ba8c;
  font-size: 7px;
  letter-spacing: 0.18em;
}
.exit-caption h3 {
  font:
    normal 30px Georgia,
    serif;
  color: #efe2c9;
  margin: 9px 0;
}
.handoff-veil {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 23%, #bba284, #8e7494 35%, #35233e 80%);
  opacity: 0;
}
.avatar-sequence {
  z-index: 18;
  opacity: 0;
  background: #0e0b14;
}
.avatar-stage {
  overflow: hidden;
}
.avatar-dim {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 78%, #30213f, #08070c 70%);
}
.avatar-hero {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
  overflow: hidden;
  background: #24272d;
}
.avatar-photo {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 0;
}
.avatar-grade {
  filter: saturate(0.15) contrast(1.1) brightness(0.82);
  opacity: 0;
}
.avatar-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 55%, transparent 28%, #000b 100%);
  opacity: 0;
}
.avatar-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    #0000000e 3px,
    #0000000e 4px
  );
}
.avatar-live {
  position: absolute;
  top: 7%;
  left: 6%;
  padding: 4px 6px;
  border-radius: 2px;
  font:
    bold 7px Arial,
    sans-serif;
  letter-spacing: 0.12em;
  color: #fff;
  background: #dc2626e6;
  opacity: 0;
}
.avatar-lower-third {
  position: absolute;
  bottom: 12%;
  left: 7%;
  right: 7%;
  padding: 15px 0;
  border-top: 1px solid #ffffff40;
  opacity: 0;
  color: white;
  text-shadow: 0 2px 9px #000;
}
.avatar-lower-third span {
  font:
    600 7px Arial,
    sans-serif;
  letter-spacing: 0.16em;
  color: #d1c9c6;
}
.avatar-lower-third h3 {
  font:
    800 32px Arial,
    sans-serif;
  margin: 6px 0 0;
  letter-spacing: -0.025em;
}
.avatar-stamp {
  position: absolute;
  z-index: 4;
  top: 49%;
  left: 50%;
  width: 77%;
  height: auto;
  opacity: 0;
  transform: translate(-50%, -50%) rotate(-12deg);
}
.avatar-roster-label {
  position: absolute;
  top: 92%;
  left: 0;
  right: 0;
  text-align: center;
  font:
    6px Arial,
    sans-serif;
  letter-spacing: 0.17em;
  color: #c5b7a5;
  opacity: 0;
}
.decision-film.c-static .decision-shot {
  opacity: 1;
}
.decision-film.c-static .exit-shot,
.decision-film.c-static .avatar-sequence {
  opacity: 0;
}
.decision-film.c-static.film-exit .exit-shot {
  opacity: 1;
}
.decision-film.c-static .exit-caption {
  opacity: 1;
}
.decision-film.c-static .gate-left {
  transform: translateX(-105%);
}
.decision-film.c-static .gate-right {
  transform: translateX(105%) scaleX(-1);
}
.decision-film.c-static .decision-intro {
  opacity: 1;
}
.ceremony-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  opacity: 0.58;
}
.ceremony-backdrop-shade {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse at 50% 38%, transparent 25%, #0b07104d 85%),
    linear-gradient(0deg, #0a0714b5, transparent 38%);
  pointer-events: none;
}
.shock-quake {
  position: absolute;
  inset: 0;
  transform-origin: 50% 32%;
}
.shock-impact {
  position: absolute;
  inset: 0;
  z-index: 14;
  pointer-events: none;
}
.shock-pressure {
  position: absolute;
  left: 2%;
  top: 0%;
  width: 96%;
  height: 64%;
  border-radius: 50%;
  border: 2px solid #ead0a2;
  box-shadow:
    inset 0 0 25px #c79be84d,
    0 0 25px #d5b57e50;
  opacity: 0;
}
.shock-fracture {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 35%,
    #b397c36e 45%,
    #e1c395c4 50%,
    #9c78b747 55%,
    transparent 65%
  );
  opacity: 0;
}
.shock-interruption {
  position: absolute;
  top: 47%;
  left: 0;
  right: 0;
  color: #f0dbb1;
  font:
    bold 7px Arial,
    sans-serif;
  letter-spacing: 0.4em;
  text-align: center;
  opacity: 0;
  text-shadow: 0 0 12px #a783ce;
}
.shock-v4 .cine-cut {
  background: radial-gradient(ellipse at 50% 27%, #bb9c97, #654b7b 50%, #140e22);
}
/* Two bounded compositor planes give the announcement cards a gentle forward drift. */
.announcement-space {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  perspective: 600px;
}
.space-plane {
  position: absolute;
  inset: -6%;
  opacity: 0.35;
  transform-origin: 50% 42%;
  background:
    radial-gradient(ellipse at 25% 30%, #9061b530, transparent 42%),
    radial-gradient(ellipse at 75% 65%, #5a387e2b, transparent 40%),
    radial-gradient(1px 1px at 22% 24%, #cfbddc99, transparent),
    radial-gradient(1px 1px at 73% 17%, #dec8a480, transparent),
    radial-gradient(1px 1px at 83% 51%, #cebad88c, transparent),
    radial-gradient(1px 1px at 33% 78%, #d5bd9966, transparent),
    radial-gradient(1px 1px at 59% 58%, #c8a2d46e, transparent);
}
.space-plane-b {
  inset: -9%;
  background:
    radial-gradient(ellipse at 65% 34%, #9d74b01f, transparent 47%),
    radial-gradient(1px 1px at 31% 40%, #f4d7a26e, transparent),
    radial-gradient(1px 1px at 68% 72%, #e5cadd88, transparent),
    radial-gradient(1px 1px at 13% 65%, #b7a1cc88, transparent);
}
.announcement-line {
  position: absolute;
  top: 28%;
  left: 33%;
  width: 34%;
  height: 1px;
  background: linear-gradient(90deg, transparent, #c5a97099, transparent);
  transform-origin: left;
  opacity: 0;
}
.gallery-stage .stage-idle {
  z-index: 1;
  perspective: 800px;
}
.gallery-stage .stage-idle h1 {
  transform-origin: 50% 60%;
}
@media (prefers-reduced-motion: reduce) {
  .announcement-space {
    display: none;
  }
}
`,o=`/* Revision 5: one organic Eye interruption; no architectural wipes or HUD effects. */
.shock-film {
  --shock-accent: #c9ad86;
  background: #07050b;
  perspective: none;
}
.shock-film[data-shock='danger'] {
  --shock-accent: #b88f88;
}
.shock-film[data-shock='rose'] {
  --shock-accent: #c4a0b4;
}
.shock-film[data-shock='storm'] {
  --shock-accent: #a5a0ba;
}
.shock-film[data-shock='dawn'] {
  --shock-accent: #c8a68b;
}
.shock-chamber,
.shock-lens,
.shock-room-plane,
.shock-city-window {
  position: absolute;
  inset: 0;
}
.shock-chamber {
  transform-origin: 50% 25.6667%;
}
.shock-lens {
  transform-origin: 50% 25.6667%;
}
.shock-film .eye-window-room {
  --eye-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1500'%3E%3Cpath fill='white' fill-rule='evenodd' d='M0 0H1000V1500H0Z M569 385A69 69 0 1 0 431 385A69 69 0 1 0 569 385Z'/%3E%3C/svg%3E");
}
.shock-wall {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.shock-city-window {
  z-index: 0;
  overflow: hidden;
}
.shock-city {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 64%;
  opacity: 0.9;
}
.shock-interrupted-feed {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #100b1b;
}
.shock-feed-city {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 64%;
  filter: brightness(0.7) saturate(0.75);
}
.shock-clash-light {
  position: absolute;
  inset: 0;
  z-index: 11;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 27%, #d0b788aa, #8e6fa252 43%, #11091d40 80%);
  opacity: 0;
}
.shock-film.c-static .shock-interrupted-feed,
.shock-film.c-static .shock-clash-light {
  opacity: 0;
}
.shock-room-plane {
  z-index: 1;
}
.shock-iris {
  position: absolute;
  z-index: 2;
  left: 33.3%;
  top: 14.5333%;
  width: 33.4%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 50%;
  mask-image: radial-gradient(
    circle closest-side,
    transparent 0 40%,
    #000 42% 94%,
    transparent 100%
  );
  transform-origin: 50% 50%;
}
.shock-iris-texture {
  position: absolute;
  left: -99.7006%;
  top: -65.2693%;
  width: 299.4012%;
  height: 449.1018%;
  max-width: none;
  object-fit: fill;
}
.shock-chamber-shadow {
  position: absolute;
  z-index: 3;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse 52% 28% at 50% 26.6667%, transparent 35%, #050309d9 100%);
}
.shock-eye-light {
  position: absolute;
  z-index: 4;
  left: 9%;
  top: 12%;
  width: 82%;
  height: 31%;
  opacity: 0;
  background: radial-gradient(ellipse, #b7894a05 23%, #c7a36b2b 49%, transparent 70%);
  pointer-events: none;
}
.shock-breath {
  position: absolute;
  z-index: 5;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 28% 45%, #856d9b24, transparent 58%),
    linear-gradient(112deg, transparent 35%, #c0a17f0b 49%, transparent 60%);
}
.shock-blackout {
  position: absolute;
  z-index: 8;
  inset: 0;
  background: #040208;
  opacity: 0;
  pointer-events: none;
}
.shock-hush,
.shock-presence {
  position: absolute;
  z-index: 9;
  left: 7%;
  right: 7%;
  text-align: center;
  color: #c8b8a0;
  font:
    5.7px Arial,
    sans-serif;
  letter-spacing: 0.24em;
  opacity: 0;
}
.shock-hush {
  top: 58%;
}
.shock-presence {
  top: 60%;
  color: #d0bfa6;
}
.shock-film .cine-titles {
  z-index: 10;
  bottom: 13%;
  left: 9%;
  right: 9%;
}
.shock-film .cine-titles > span {
  font-size: 5.8px;
  letter-spacing: 0.21em;
  color: #a99c8d;
}
.shock-film .cine-titles h3 {
  color: #e4d5c2;
  font:
    normal 29px/1.12 Georgia,
    serif;
  letter-spacing: 0.02em;
  margin: 15px 0 0;
  text-wrap: balance;
}
.shock-film .cine-titles p {
  font:
    9px/1.6 Arial,
    sans-serif;
  color: #b7a9a2;
  letter-spacing: 0.03em;
  margin: 16px auto 0;
  max-width: 95%;
}
.shock-film .cine-titles > .shock-rule {
  height: 1px;
  width: 40px;
  margin: 17px auto 0;
  background: linear-gradient(90deg, transparent, var(--shock-accent), transparent);
  transform-origin: center;
  opacity: 0;
}
.shock-film[data-motif='slashes'] .shock-rule {
  height: 3px;
  border-top: 1px solid var(--shock-accent);
  border-bottom: 1px solid var(--shock-accent);
  background: none;
}
.shock-edge-shade {
  position: absolute;
  z-index: 7;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(0deg, #07050bf2, transparent 62%),
    radial-gradient(ellipse at 50% 35%, transparent 40%, #08050c7a);
}
.shock-film.c-static .shock-chamber {
  opacity: 1;
  transform: scale(1.04);
}
.shock-film.c-static .cine-titles {
  opacity: 1;
}
.shock-film.c-static .shock-chamber-shadow {
  opacity: 0.73;
}
.shock-film.c-static .shock-city {
  opacity: 0.025;
}
.shock-film.c-static .shock-copy {
  opacity: 1;
}
.shock-film.c-static .shock-blackout,
.shock-film.c-static .shock-hush,
.shock-film.c-static .shock-presence {
  opacity: 0;
}
@media (max-width: 360px) {
  .shock-film .cine-titles h3 {
    font-size: 25px;
  }
  .shock-film .cine-titles p {
    font-size: 8px;
  }
}
/* Finals: move closer to the holder, then carry the gaze to the nominee. */
.suspense-decision .decision-verdict {
  left: 7%;
  right: 48%;
  bottom: 13%;
  text-align: left;
}
.suspense-decision .decision-verdict h3 {
  font-size: 31px;
}
.suspense-decision .decision-verdict span {
  line-height: 1.8;
  display: block;
  font-size: 5.6px;
  letter-spacing: 0.12em;
}
.suspense-decision .decision-verdict p {
  font-size: 6px;
  line-height: 1.7;
  letter-spacing: 0.14em;
}
.decision-spotlight {
  left: 59%;
  top: 8%;
  width: 47%;
  height: 60%;
  clip-path: none;
  background: radial-gradient(ellipse at 50% 44%, #ebc49020, transparent 68%);
  transform-origin: 50% 70%;
}
.decision-spotlight:after {
  content: '';
  position: absolute;
  bottom: 2%;
  left: 12%;
  width: 76%;
  height: 6%;
  border-radius: 50%;
  background: radial-gradient(ellipse, #ebc49049, transparent 72%);
}
.decision-suspense {
  position: absolute;
  z-index: 9;
  left: 7%;
  right: 7%;
  top: 10%;
  color: #dac7a8;
  font:
    6px Arial,
    sans-serif;
  letter-spacing: 0.2em;
  text-align: center;
  opacity: 0;
  text-shadow: 0 2px 8px #000;
}
`,s=`:host {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse at 50% 30%, #24152e, #050309 80%);
}
.stage {
  position: relative !important;
  width: min(100vw, 66.6667dvh) !important;
  height: auto !important;
  max-width: none !important;
  aspect-ratio: 2/3 !important;
  max-height: 100dvh !important;
  border: 0 !important;
  border-radius: 0 !important;
  overflow: hidden !important;
  background: #0a0710 !important;
  transform: none !important;
}
.c-scene,
.loh-scene {
  position: absolute;
  inset: 0;
}
.loh-figure {
  width: 76%;
  height: auto;
  aspect-ratio: 2/3;
  left: 12%;
  margin: 0;
  bottom: 18%;
}
.loh-pose {
  position: absolute;
  inset: 0;
}
.loh-pose .loh-person {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.loh-seated {
  left: 12%;
  width: 76%;
  height: auto;
  aspect-ratio: 2/3;
  bottom: 18%;
}
.loh-seat-throne,
.loh-seated-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.loh-backdrop {
  position: absolute;
  inset: 0;
  transform-origin: 50% 40%;
}
.loh-backdrop-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.55);
}
.loh-flash {
  z-index: 3;
}
.loh-seat-flash {
  z-index: 4;
}
.loh-titles {
  z-index: 5;
}
.cine-royal {
  aspect-ratio: 2/3;
}
.cine-seated {
  width: 100%;
  height: auto;
  display: block;
}
.cine-person > .cine-body {
  width: 100%;
  height: auto;
  display: block;
}
.fitted-knight-shield {
  position: absolute;
  left: 53%;
  top: 39%;
  width: 22%;
  height: 25%;
  object-fit: contain;
  z-index: 4;
  opacity: 0;
}
/* Occlusion is a binary depth transfer at the real doorway, not a dissolve. */
.decision-film .departure-near,
.decision-film .departure-far {
  transform-origin: 50% 100%;
}
.decision-film .cine-rear {
  object-fit: fill;
}

/* Keep the drapery anchored above the ceiling while retaining its floor line. */
.fitted-loh .loh-curtain {
  top: -2%;
  height: 80%;
}
.fitted-loh .loh-curtain img {
  object-fit: fill;
}

.c-nominations.nom-three .nom-pod {
  width: 31%;
  height: 57%;
  top: 20%;
}
.c-nominations.nom-three .nom-first {
  left: 1%;
}
.c-nominations.nom-three .nom-second {
  left: 34%;
  right: auto;
}
.c-nominations.nom-three .nom-third {
  left: 67%;
}

/* Optical announcement layers share the title's lifetime and stay behind the lettering. */
.shock-film[data-shock-kind] .cine-titles {
  --shock-accent: var(--shock-theme-accent);
  isolation: isolate;
}
.shock-title-fx {
  position: absolute;
  inset: -55% -16% -42%;
  z-index: -1;
  pointer-events: none;
  contain: layout style;
}
.shock-title-fx > div {
  position: absolute;
  inset: 0;
  opacity: 0;
}
.shock-title-fx svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.shock-fx-veil {
  background:
    radial-gradient(
      ellipse at 28% 55%,
      color-mix(in srgb, var(--shock-theme-color) 27%, transparent),
      transparent 51%
    ),
    radial-gradient(
      ellipse at 74% 47%,
      color-mix(in srgb, var(--shock-theme-accent) 12%, transparent),
      transparent 47%
    ),
    radial-gradient(ellipse at 50% 70%, #07050b9c, transparent 65%);
}
.shock-title-fx > .shock-fx-horizon {
  top: 71%;
  bottom: auto;
  height: 15%;
  left: 4%;
  right: 4%;
  background:
    radial-gradient(ellipse at 50% 50%, #fff1d470, transparent 9%),
    radial-gradient(ellipse at 50% 50%, var(--shock-theme-color), transparent 66%);
  mask-image: linear-gradient(transparent, #000 45%, #000 55%, transparent);
}
.shock-title-fx > .shock-fx-horizon::after {
  content: '';
  position: absolute;
  left: 3%;
  right: 3%;
  top: 50%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--shock-theme-color),
    #e8d9b9,
    var(--shock-theme-color),
    transparent
  );
}
.shock-title-fx > .shock-fx-glint {
  inset: 13% -4% 22%;
  background:
    radial-gradient(ellipse at 50% 50%, #fff4de94, transparent 3%),
    radial-gradient(
      ellipse at 50% 50%,
      color-mix(in srgb, var(--shock-theme-accent) 44%, transparent),
      transparent 14%
    ),
    radial-gradient(
      ellipse at 50% 50%,
      color-mix(in srgb, var(--shock-theme-color) 33%, transparent),
      transparent 43%
    );
}
.shock-film[data-shock-flow='fall'] .shock-fx-veil {
  background:
    radial-gradient(ellipse at 30% 30%, #46628e33, transparent 54%),
    radial-gradient(ellipse at 70% 65%, #03050db0, transparent 65%);
}

/* Full, overlapping mist fields; no hard clipping or separate cloud fragments. */
.shock-fx-mist img,
.shock-fx-optical img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}
.shock-fx-mist,
.shock-fx-optical {
  filter: sepia(0.55) saturate(0.8) hue-rotate(280deg);
}
.shock-film[data-shock-flow='rise'] .shock-fx-mist,
.shock-film[data-shock-flow='rise'] .shock-fx-optical,
.shock-film[data-shock-flow='converge'] .shock-fx-mist,
.shock-film[data-shock-flow='converge'] .shock-fx-optical {
  filter: sepia(0.6) saturate(0.85) hue-rotate(83deg);
}
.shock-film[data-shock-flow='fall'] .shock-fx-mist {
  filter: sepia(0.8) saturate(0.65) hue-rotate(165deg);
}
.shock-film[data-shock-flow='rupture'] .shock-fx-optical {
  filter: sepia(0.8) saturate(1.4) hue-rotate(309deg);
}
.shock-film[data-shock-flow='prism'] .shock-fx-mist {
  filter: sepia(0.65) saturate(0.8) hue-rotate(115deg);
}
.shock-fx-mist,
.shock-fx-optical {
  mask-image: radial-gradient(ellipse 47% 47% at 50% 58%, #0006 35%, #000 90%);
}
.shock-film .shock-copy {
  text-shadow:
    0 1px 5px #07050b,
    0 1px 13px #07050b;
}
.shock-fx-motifs {
  perspective: 500px;
}
.shock-motif {
  position: absolute;
  height: auto;
  opacity: 0;
  transform-origin: 50% 50%;
}
.shock-motif img {
  display: block;
  width: 100%;
  height: auto;
}
.shock-motif-heart-left img {
  clip-path: polygon(0 0, 52% 0, 47% 31%, 54% 44%, 46% 56%, 53% 69%, 48% 100%, 0 100%);
}
.shock-motif-heart-right img {
  clip-path: polygon(52% 0, 100% 0, 100% 100%, 48% 100%, 53% 69%, 46% 56%, 54% 44%, 47% 31%);
}
.shock-motif-beam {
  height: 150%;
  background: linear-gradient(180deg, #fce7b96b, #fce7b90a);
  clip-path: polygon(44% 0, 56% 0, 100% 100%, 0 100%);
  mask-image: radial-gradient(ellipse, #000 15%, transparent 70%);
}

/* The room slowly loses colour only after the Depression announcement begins. */
.shock-depression-grade,
.shock-depression-weight {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
  opacity: 0;
}
.shock-depression-grade {
  background: #777;
  mix-blend-mode: color;
}
.shock-depression-weight {
  background: linear-gradient(180deg, #07091122, #02040db3);
}
.shock-film[data-shock-kind='depressionShock'] .shock-title {
  color: #ced2d9;
}
.shock-film[data-shock-kind='depressionShock'] .shock-copy {
  color: #aab0bc;
}

.shock-motif-ballot img {
  position: relative;
  z-index: 1;
}
.shock-election-ballot {
  position: absolute;
  z-index: 0;
  left: 52%;
  top: 10%;
  width: 27%;
  height: 34%;
  opacity: 0;
  background: linear-gradient(110deg, #c1b397, #f3ebd8 36%, #e2d9c2 84%);
  border: 1px solid #d7c39b;
  box-shadow: 0 2px 5px #0005;
}
.shock-election-ballot svg {
  width: 100%;
  height: 100%;
  display: block;
}

.shock-film[data-shock-flow='cleanse'] .shock-fx-mist,
.shock-film[data-shock-flow='cleanse'] .shock-fx-optical {
  filter: sepia(0.6) saturate(0.9) hue-rotate(80deg);
}
.shock-detox-aura,
.shock-force-release {
  position: absolute;
  pointer-events: none;
  opacity: 0;
  z-index: -1;
}
.shock-detox-aura {
  inset: -35% -80%;
  background: radial-gradient(
    ellipse at 50% 62%,
    #d3efba70,
    #80cda944 21%,
    #67a6901c 42%,
    transparent 65%
  );
}
.shock-force-release {
  inset: -60% -100%;
  background: radial-gradient(ellipse, #f2dfb693, #c9a56335 18%, #9c6bb623 38%, transparent 62%);
}
`;function c(e){return e===`cupidArrow`||e===`cupidBroken`?[`shockHeart`]:e===`diamond`?[`shockHalo`]:e===`vip`?[`cinema_shield`]:e===`twinShock`?[`shockDna`]:e===`democracia`?[`shockBallot`]:e===`coup`?[`shockAntidote`]:e===`spotlight`?[`shockForce`,`cinema_shield`]:[]}function l(e,t,n){let r=document.createElement(`div`);r.className=`shock-fx-motifs`;let i=(e,t,i,a,o,s)=>{let c=document.createElement(`div`);if(c.className=`shock-motif shock-motif-${e}`,c.dataset.kind=e,c.dataset.index=s,Object.assign(c.style,{left:`${i}%`,top:`${a}%`,width:`${o}%`}),t){let e=n[t].cloneNode();e.alt=``,e.draggable=!1,c.append(e)}return r.append(c),c};if(t===`cupidArrow`)[[12,45,12],[86,30,10],[78,88,7],[22,87,8]].forEach(([e,t,n],r)=>i(`heart`,`shockHeart`,e,t,n,r));else if(t===`cupidBroken`)i(`heart-left`,`shockHeart`,50,12,19,0),i(`heart-right`,`shockHeart`,50,12,19,1);else if(t===`diamond`)i(`halo`,`shockHalo`,22,16,29,0),i(`halo`,`shockHalo`,78,85,24,1);else if(t===`vip`)i(`shield`,`cinema_shield`,12,40,11,0),i(`shield`,`cinema_shield`,88,40,11,1);else if(t===`twinShock`)i(`dna`,`shockDna`,12,48,20,0),i(`dna`,`shockDna`,88,53,18,1);else if(t===`democracia`){let e=i(`ballot`,`shockBallot`,50,10,27,0),t=document.createElement(`div`);t.className=`shock-election-ballot`,t.innerHTML=`<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M7 12h16M7 17h12M8 27l5 5 10-12" fill="none" stroke="#8a6938" stroke-width="1.4"/></svg>`,e.prepend(t)}else if(t===`coup`){let e=i(`antidote`,`shockAntidote`,50,11,18,0),t=document.createElement(`div`);t.className=`shock-detox-aura`,e.prepend(t)}else if(t===`spotlight`){i(`pressure`,`shockForce`,50,10,49,0);let e=i(`forced-shield`,`cinema_shield`,50,10,16,1),t=document.createElement(`div`);t.className=`shock-force-release`,e.prepend(t)}r.children.length&&e.append(r)}function u(e,t,n,r){if(e.querySelector(`.shock-fx-motifs`)){n(`.shock-fx-motifs`,[[0,0],[3900,0],[4250,1],[r,1]]),t===`democracia`&&n(`.shock-election-ballot`,[[0,0],[4300,0,`translate(-50%,-100%) rotate(-9deg)`],[4700,1,`translate(-50%,-65%) rotate(-5deg)`],[5550,1,`translate(-50%,70%) rotate(-2deg)`],[5900,0,`translate(-50%,100%) rotate(0)`],[r,0]]),t===`coup`&&n(`.shock-detox-aura`,[[0,0],[4700,0,`scale(.5)`],[5300,.75,`scale(1)`],[6400,.24,`scale(1.7)`],[r,0,`scale(2)`]]),t===`spotlight`&&n(`.shock-force-release`,[[0,0],[5150,0,`scale(.4)`],[5400,.75,`scale(1)`],[5850,0,`scale(2.2)`],[r,0]]);for(let t of e.querySelectorAll(`.shock-motif`)){let e=Number(t.dataset.index),i=t.dataset.kind,a=e%2?1:-1;if(i===`pressure`){n(t,[[0,0],[4e3,0,`translate(-50%,-50%) scale(1.22) rotate(-9deg)`],[4800,.6,`translate(-50%,-50%) scale(.88) rotate(-3deg)`],[5200,.7,`translate(-50%,-50%) scale(.76) rotate(0)`],[5900,.3,`translate(-50%,-50%) scale(1.28) rotate(8deg)`],[7e3,.08,`translate(-50%,-50%) scale(1.55) rotate(14deg)`],[r,0,`translate(-50%,-50%) scale(1.7) rotate(17deg)`]]);continue}let o=4e3+(i===`heart`?e*190:0),s=`translate(-50%,-50%) `,c,l,u;if(i===`heart`)c=`translate(${a*10}%,22%) rotate(${a*18}deg) scale(.8)`,l=`translate(0,0) rotate(${a*8}deg) scale(1)`,u=`translate(${a*24}%,-65%) rotate(${a*-8}deg) scale(1.04)`;else if(i.startsWith(`heart-`)){let e=i===`heart-left`?-1:1;c=`translate(0,12%) scale(.9)`,l=`translate(0,0) scale(1)`,u=`translate(${e*58}%,23%) rotate(${e*22}deg) scale(.94)`}else i===`halo`?(c=`translate(0,14%) rotate(${a*8}deg) scale(.88)`,l=`translate(${a*-25}%,0) rotate(${a*3}deg) scale(1)`,u=`translate(${a*-175}%,-7%) rotate(${a*-8}deg) scale(${e?1.08:.92})`):i===`dna`?(c=`translate(0,16%) rotate(${a*9}deg) scale(.88)`,l=`translate(0,0) rotate(${a*3}deg) scale(1)`,u=`translate(${a*5}%,-9%) rotate(${a*-4}deg) scale(1.03)`):i===`ballot`?(c=`translateY(8%) scale(.94)`,l=`translateY(0) scale(1)`,u=`translateY(0) scale(1.02)`):i===`antidote`?(c=`translateY(13%) rotate(-7deg) scale(.86)`,l=`translateY(0) rotate(-2deg) scale(1)`,u=`translateY(-5%) rotate(3deg) scale(1.02)`):i===`forced-shield`?(c=`translateY(-28%) rotate(-10deg) scale(.8)`,l=`translateY(0) rotate(0) scale(1.05)`,u=`translateY(1%) rotate(0) scale(1)`):(c=`translate(0,15%) rotate(${a*8}deg) scale(.85)`,l=`translate(0,0) rotate(${a*3}deg) scale(1)`,u=`translate(${a*12}%,-16%) rotate(${a*-3}deg) scale(1.03)`);let d=i.startsWith(`heart-`);n(t,[[0,0],[o,0,s+c],[o+750,.82,s+l,`cubic-bezier(.4,0,.2,1)`],[d?6800:7600,d?0:.44,s+u],[r,0,s+u]])}}}var d={cupidArrow:{accent:`#efb0cf`,color:`#c74b8b`,flow:`entwine`},cupidBroken:{accent:`#d3aec8`,color:`#8a467c`,flow:`shatter`},depressionShock:{accent:`#a5bbda`,color:`#36567e`,flow:`fall`},democracia:{accent:`#baded0`,color:`#3d937e`,flow:`converge`},doubleEviction:{accent:`#e8b2a2`,color:`#aa3049`,flow:`rupture`},voxDouble:{accent:`#cbb2e3`,color:`#873ca3`,flow:`rupture`},battleBack:{accent:`#c3e4cd`,color:`#388d73`,flow:`rise`},battleBackRules:{accent:`#c3e4cd`,color:`#388d73`,flow:`rise`},battleBackChallenge:{accent:`#ded3aa`,color:`#708752`,flow:`rise`},vip:{accent:`#e2c7e9`,color:`#925a9f`,flow:`entwine`},diamond:{accent:`#cce8e7`,color:`#469da5`,flow:`prism`},coup:{accent:`#c6e5cb`,color:`#568b7b`,flow:`cleanse`},spotlight:{accent:`#ecdec2`,color:`#b09a60`,flow:`converge`},twinShock:{accent:`#d8bfe7`,color:`#8860a7`,flow:`entwine`},dayStartShock:{accent:`#e8b2a2`,color:`#aa3049`,flow:`rupture`},generic:{accent:`#ded0b2`,color:`#85638e`,flow:`rise`}};function f(e,t){return`<svg viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">${[[24,201,1.2],[63,85,.7],[111,230,1.5],[149,60,.8],[202,242,.6],[237,89,1],[302,246,.8],[354,67,1.4],[401,230,.7],[449,98,.9],[503,197,1.2],[561,65,.7]].map(([n,r,i],a)=>`<g transform="translate(${t?600-n:n} ${t?300-r:r})" opacity="${.25+a%4*.16}">
      <circle r="${i*4}" fill="${e.color}" opacity=".13"/>
      <circle r="${i}" fill="${a%3?e.accent:`#f1dbac`}"/>
      ${a%4==0?`<path d="M-5 0H5M0-3V3" stroke="${e.accent}" stroke-width=".45" opacity=".65"/>`:``}
    </g>`).join(``)}</svg>`}function p(e,t,n){let r=d[t]??d.generic;e.dataset.shockKind=t,e.dataset.shockFlow=r.flow,e.style.setProperty(`--shock-theme-accent`,r.accent),e.style.setProperty(`--shock-theme-color`,r.color);let i=document.createElement(`div`);i.className=`shock-title-fx`,i.setAttribute(`aria-hidden`,`true`),i.innerHTML=`<div class="shock-fx-veil"></div>
    <div class="shock-fx-mist shock-fx-mist-a"></div>
    <div class="shock-fx-mist shock-fx-mist-b"></div>
    <div class="shock-fx-optical"></div>
    <div class="shock-fx-dust shock-fx-dust-back">${f(r,!0)}</div>
    <div class="shock-fx-dust shock-fx-dust-front">${f(r,!1)}</div>
    <div class="shock-fx-horizon"></div><div class="shock-fx-glint"></div>`;for(let e of i.querySelectorAll(`.shock-fx-mist`)){let t=n.shockMist.cloneNode();t.alt=``,t.draggable=!1,e.append(t)}let a=n.shockAtmosphere.cloneNode();if(a.alt=``,a.draggable=!1,i.querySelector(`.shock-fx-optical`).append(a),l(i,t,n),e.querySelector(`.cine-titles`).append(i),t===`depressionShock`)for(let t of[`grade`,`weight`]){let n=document.createElement(`div`);n.className=`shock-depression-${t}`,e.append(n)}}function m(e,t,n,r){let i=d[t]??d.generic;t===`depressionShock`&&(n(`.shock-depression-grade`,[[0,0],[4200,0],[6800,.97],[r,.97]]),n(`.shock-depression-weight`,[[0,0],[4400,0],[7e3,.32],[r,.32]]));let a=r,o=3800,s=`cubic-bezier(.16,1,.3,1)`;n(`.shock-fx-veil`,[[0,0],[o,0,`scale(.68)`],[4800,.78,`scale(1)`,s],[6500,.48,`scale(1.08)`],[a,0,`scale(1.14)`]]);for(let[e,t]of[`.shock-fx-mist-a`,`.shock-fx-mist-b`].entries()){let r=e?1:-1,s=i.flow===`fall`?1:-1,c=e?`scaleX(-1) `:``;n(t,[[0,0],[o+e*100,0,`${c}translate(${r*-5}%,${s*-5}%) scale(1.02)`],[4800+e*150,e?.2:.32,`${c}translate(${r*-2}%,${s*-2}%) scale(1.05)`],[6500,e?.16:.25,`${c}translate(${r*1}%,${s*2}%) scale(1.09)`],[a,0,`${c}translate(${r*5}%,${s*7}%) scale(1.14)`]])}n(`.shock-fx-optical`,[[0,0],[3900,0,`scale(.98)`],[4700,.2,`scale(1.01)`],[6500,.1,`scale(1.05)`],[a,0,`scale(1.08)`]]),u(e,t,n,a),n(`.shock-fx-horizon`,[[0,0],[3900,0,`scaleX(.08)`],[4450,.9,`scaleX(1)`,s],[5200,.32,`scaleX(1.07)`],[a,0,`scaleX(1.12)`]]),n(`.shock-fx-glint`,[[0,0],[4050,0,`translateX(-28%) scaleX(.15)`],[4450,.85,`translateX(-6%) scaleX(.8)`],[5050,0,`translateX(27%) scaleX(.35)`],[a,0]]);for(let[e,t]of[`.shock-fx-dust-back`,`.shock-fx-dust-front`].entries()){let r=i.flow===`fall`,o=i.flow===`shatter`;n(t,[[0,0],[4100+e*170,0,`translateY(9%) scale(.92)`],[5e3+e*180,e?.85:.5,`translateY(0) scale(1)`],[a-350,0,`translate(${o?e?13:-13:0}%,${r?21:-17}%) scale(${e?1.15:1.05})`],[a,0]])}}var h={a:{label:`Role A`,poses:{ceremonyFront:`cinema_standA`,decisionBack:`cinema_decisionA`,royalSeated:`cinema_seatedA`}},b:{label:`Role B`,poses:{ceremonyFront:`cinema_standB`,decisionBack:`cinema_decisionB`}},c:{label:`Role C`,poses:{ceremonyFront:`cinema_standC`,exitBack:`cinema_exitC`}}},g=[[`a`,`b`,`c`],[`b`,`a`,`c`]],_=[`tiebreak`,`ambush`,`allPower`,`shock`,`final4`,`final3`],v=Object.values(h).map(e=>e.poses.ceremonyFront),y=[`cinema_hall`,`cinema_atmosphere`,`cinema_portal`],b={tiebreak:{duration:7e3,art:[...y,...v.slice(0,2),`cinema_console`,`cinema_token`],description:`The votes are tied 4–4. The LOH’s gold deciding vote lands and travels to its target; the tally changes to 5–4 and the eliminated nominee is identified.`,beats:[[`00.0`,`Enter the chamber: a 4–4 tie`],[`01.9`,`The LOH’s deciding vote lands`],[`03.7`,`The vote reaches its target: 5–4`]],moments:[1e3,2800,5200]},ambush:{duration:7e3,art:[...y,...v,`cinema_shield`],description:`Safety rescues one initial nominee, visibly opening a replacement slot. The camera crosses the room as the portal reveals the hidden target; red light locks the new nominee onto the block.`,beats:[[`00.0`,`The original nominees`],[`01.4`,`Safety opens a replacement slot`],[`03.1`,`The ambush target is nominated`]],moments:[900,2e3,4700]},allPower:{duration:8600,art:[`cinema_royalRoom`,`cinema_city`,`cinema_throne`,`cinema_standA`,`cinema_seatedA`,`cinema_shield`,`cinema_crown`,`cinema_atmosphere`,`cinema_portal`],description:`Enter the royal room, receive Safety and reveal the seated holder of both powers. The camera then passes the throne and approaches the city through the real window aperture before the final title.`,beats:[[`00.0`,`Enter the royal room`],[`01.5`,`Safety joins the crown`],[`02.9`,`The sovereign is revealed`],[`04.4`,`Pass the throne and approach the city`]],moments:[900,2300,4100,6400,7800]},shock:{duration:6200,art:[`cinema_shockRoom`,`cinema_city`,`cinema_atmosphere`,`cinema_portal`],description:`The camera pulls away from the city watched through the Eye. The broadcast is interrupted by an aperture sweep, moving light rings and a visual cue specific to the selected shock.`,beats:[[`00.0`,`The Eye watches the city`],[`01.8`,`The broadcast is interrupted`],[`02.5`,`The actual twist is announced`]],moments:[900,2100,4400]},final4:{duration:7200,art:[...y,...v,`cinema_console`,`cinema_token`,`cinema_shield`],description:`Three eligible players enter. The Safety holder is protected in gold; their single vote travels to one of the two nominees. A clear 1–0 verdict identifies who leaves. The LOH stays off-stage.`,beats:[[`00.0`,`Safety holder and two nominees`],[`01.9`,`The holder casts the only vote`],[`03.8`,`The 1–0 verdict is revealed`]],moments:[1e3,2800,5400]},final3:{duration:8400,art:[...y,...v,`cinema_exitC`,`cinema_crown`],description:`The final LOH names the third-place finisher. After the camera changes, the player walks all the way to the threshold, passes inside the doorway without fading, and is hidden by the closing doors.`,beats:[[`00.0`,`The final LOH faces two finalists`],[`02.0`,`Third place is named`],[`03.0`,`The player reaches and crosses the doorway`]],moments:[1300,4e3,5100,6100,7400]}},x=(e,t,n=`props`)=>`<img data-cinema-art="${e}" class="${t} cine-layer" data-layer="${n}" alt="">`,S=(e,t,{crown:n=!1,badge:r=``}={})=>`<div class="cine-person ${t} cine-layer" data-layer="actors"><div class="cine-reflection">${x(e,`cine-reflected-body`,`actors`)}</div><i class="cine-contact"></i>${x(e,`cine-body`,`actors`)}${n?x(`cinema_crown`,`cine-crown`,`props`):``}${r?`<div class="actor-badge">${r}</div>`:``}</div>`,C=e=>x(e,`cine-bg`,`set`),w=()=>`<div class="cine-gates cine-layer" data-layer="props">${x(`cinema_portal`,`cine-gate gate-left`)}${x(`cinema_portal`,`cine-gate gate-right`)}</div>`,T=(e,t,n)=>`<div class="cine-titles cine-layer" data-layer="titles"><span>${e}</span><h3>${t}</h3><p>${n}</p><i></i></div>`,E=(e,t)=>`<div class="cine-beat ${e} cine-layer" data-layer="titles">${t}</div>`,D=()=>`<div class="cine-voting cine-layer" data-layer="props">${x(`cinema_console`,`cine-console`)}${x(`cinema_token`,`cine-token`)}<i class="cine-token-light"></i><div class="vote-caption">ONE DECIDING VOTE</div></div>`,O=(e,t,n)=>`<div class="vote-tally ${e} cine-layer" data-layer="titles"><b>${t}</b><i>–</i><b>${n}</b></div>`,k=e=>`<div class="verdict-bracket cine-layer" data-layer="light"><i></i><i></i><span>${e} · ELIMINATED</span></div>`,A=()=>`<div class="city-depth cine-layer" data-layer="set">${x(`cinema_city`,`city-plate`,`set`)}<i class="city-light city-light-a"></i><i class="city-light city-light-b"></i></div><div class="royal-room-plane">${x(`cinema_royalRoom`,`cine-bg royal-window-room`,`set`)}<div class="royal-glass cine-layer" data-layer="light"><i></i><i></i></div></div>`,j=()=>`<div class="eye-city-depth cine-layer" data-layer="set">${x(`cinema_city`,`eye-city-plate`,`set`)}</div>${x(`cinema_shockRoom`,`cine-bg eye-window-room`,`set`)}`,ee=()=>`<div class="ceremony-energy cine-layer" data-layer="light"><i class="energy-ring ring-a"></i><i class="energy-ring ring-b"></i><i class="energy-core"></i></div>`,te=()=>`<div class="depth-entrance cine-layer" data-layer="props"><div class="entrance-wing wing-left">${x(`cinema_portal`,`entrance-panel`)}</div><div class="entrance-wing wing-right">${x(`cinema_portal`,`entrance-panel`)}</div></div><div class="foreground-jamb jamb-left cine-layer" data-layer="props"></div><div class="foreground-jamb jamb-right cine-layer" data-layer="props"></div>`;function ne(e,t,n,r=0){let i=g[r]||g[0],a=h[i[0]].poses.ceremonyFront,o=h[i[1]].poses.ceremonyFront,s=h.c.poses.ceremonyFront,c=i.map(e=>`Player `+e.toUpperCase()),l=document.createElement(`div`);l.className=`c-scene c-${e} cinema-v2 cinema-v3 film-${e}`,l.dataset.cast=r,l.setAttribute(`aria-hidden`,`true`);let u=``,d=``,f=``,p=``;if(e===`tiebreak`&&(u=C(`cinema_hall`)+S(a,`role-left`,{badge:c[0]})+S(o,`role-right`,{badge:c[1]})+D()+O(`tally-before`,`4`,`4`)+O(`tally-after`,`4`,`5`)+x(`cinema_token`,`vote-flight`)+k(c[1])+`<div class="verdict-trail"></div>`,d=C(`cinema_hall`)+D(),f=T(`TIEBREAK · LOH’S DECIDING VOTE`,c[1]+` is eliminated.`,`5–4. THE LOH BROKE THE TIE.`),p=E(`beat-initial`,`THE VOTE IS TIED · 4–4`)+E(`beat-action`,`THE LOH CASTS THE DECIDING VOTE`)),e===`final4`&&(u=C(`cinema_hall`)+S(a,`role-left f4-left`,{badge:c[0]+` · NOMINEE`})+S(o,`role-center f4-center`,{badge:c[1]+` · SAFETY`})+S(s,`role-right f4-right`,{badge:c[2]+` · NOMINEE`})+x(`cinema_shield`,`cine-small-shield`)+x(`cinema_token`,`vote-flight`)+O(`tally-after`,`0`,`1`)+k(c[2])+`<div class="verdict-trail"></div><div class="safety-spotlight"></div>`,d=C(`cinema_hall`)+D(),f=T(`FINAL FOUR · THE SOLE VOTE`,c[2]+` is eliminated.`,`1–0. `+c[1].toUpperCase()+` CAST THE ONLY VOTE.`),p=E(`beat-initial`,`THE LOH IS SAFE · THREE PLAYERS IN THE CEREMONY`)+E(`beat-action`,c[1].toUpperCase()+` HOLDS SAFETY AND THE SOLE VOTE`)),e===`ambush`&&(u=C(`cinema_hall`)+S(a,`role-left ambush-original-left`,{badge:c[0]})+S(o,`role-right ambush-original-right`,{badge:c[1]})+x(`cinema_shield`,`ambush-save-shield`)+`<div class="slot-open">SAVED<br><span>REPLACEMENT SLOT OPEN</span></div>`,d=C(`cinema_hall`)+S(a,`role-back-left`,{badge:`SAVED`})+S(o,`role-back-right`,{badge:`NOMINATED`})+`<div class="cine-danger cine-layer" data-layer="light"></div><div class="cine-danger-ring cine-layer" data-layer="light"></div>`+S(s,`role-target`,{badge:c[2]})+w()+`<div class="nomination-lock lock-left"></div><div class="nomination-lock lock-right"></div>`,f=T(`AMBUSH · THE REPLACEMENT NOMINEE`,c[2]+` is nominated.`,`SAFETY SAVED `+c[0].toUpperCase()+`. THE HIDDEN TARGET TAKES THE SLOT.`),p=E(`beat-initial`,`THE ORIGINAL NOMINEES`)+E(`beat-action`,`SAFETY OPENS A REPLACEMENT SLOT`)),e===`allPower`&&(u=A()+S(h.a.poses.ceremonyFront,`power-standing`,{crown:!0})+x(`cinema_shield`,`power-award-shield`),d=A()+`<div class="royal-group">${x(`cinema_throne`,`cine-throne`)}<div class="cine-royal cine-layer" data-layer="actors">${x(h.a.poses.royalSeated,`cine-seated`,`actors`)}${x(`cinema_crown`,`cine-royal-crown`)}</div>${x(`cinema_shield`,`cine-royal-shield`)}</div><div class="royal-aura"></div>`,f=T(`LEADER OF THE HUB + POWER OF SAFETY`,`All the power.`,`PLAYER A HOLDS BOTH THE CROWN AND THE SHIELD.`),p=E(`beat-initial`,`LEADER OF THE HUB`)+E(`beat-action`,`THE SAFETY SHIELD JOINS THE CROWN`)),e===`shock`&&(l.dataset.shock=n.tone,l.dataset.motif=n.motif,u=j(),d=j()+`<div class="cine-eye-bloom cine-layer" data-layer="light"></div><div class="eye-orbit orbit-a"></div><div class="eye-orbit orbit-b"></div><div class="shock-motif"><i></i><i></i><b></b></div>`,f=T(`THE BIG EYE · SHOCK ANNOUNCEMENT`,n.title,n.copy),p=E(`beat-initial`,`THE EYE IS WATCHING`)+E(`beat-action`,`BROADCAST INTERRUPTED`)),e===`final3`){u=C(`cinema_hall`)+S(a,`role-center f3-loh`,{crown:!0,badge:c[0]+` · LOH`})+S(o,`role-left f3-survivor`,{badge:c[1]})+S(s,`role-right f3-third`,{badge:c[2]})+`<div class="final-decision">`+c[2].toUpperCase()+`<span>FINISHES IN THIRD PLACE</span></div>`;let e=e=>`<div class="cine-departure ${e} cine-layer" data-layer="actors">${x(h.c.poses.exitBack,`cine-rear`,`actors`)}</div>`;d=C(`cinema_hall`)+S(a,`role-left f3-finalist`,{badge:c[0]})+S(o,`role-right f3-finalist`,{badge:c[1]})+e(`departure-near`)+`<div class="doorway-volume">`+e(`departure-far`)+`</div>`+w()+`<div class="portal-floor-light"></div>`,f=T(`THE FINAL TWO`,c[0]+` & `+c[1],c[2].toUpperCase()+` LEFT THE HUB IN THIRD PLACE.`),p=E(`beat-initial`,`THE FINAL LOH MUST CHOOSE`)+E(`beat-action`,c[0].toUpperCase()+` ELIMINATES `+c[2].toUpperCase())}l.innerHTML=`<div class="cine-shot shot-wide"><div class="cine-world">${u}</div></div><div class="cine-shot shot-detail"><div class="cine-world">${d}</div></div>${x(`cinema_atmosphere`,`cine-atmosphere`,`light`)}<div class="cine-grade cine-layer" data-layer="light"></div>${te()}<div class="cine-cut"><i></i></div><div class="transition-blade">${x(`cinema_portal`,`transition-texture`)}</div>${ee()}<div class="cine-sweep cine-layer" data-layer="light"></div>${p}${f}<div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>`;for(let e of l.querySelectorAll(`[data-cinema-art]`)){let n=t[e.dataset.cinemaArt];if(!n)throw Error(`Missing resource `+e.dataset.cinemaArt);let r=n.cloneNode();r.className=e.className,r.dataset.layer=e.dataset.layer,r.alt=``,r.draggable=!1,e.replaceWith(r)}return e===`shock`&&(l.querySelector(`.cine-titles h3`).classList.add(`shock-title`),l.querySelector(`.cine-titles p`).classList.add(`shock-copy`)),l}function re(e,t,n){let r=b[e].duration,i=`cubic-bezier(.16,1,.3,1)`;n(t,[[0,0],[120,1],[r-250,1],[r,0]]),n(`.wing-left`,[[0,1,`translateX(0)`],[120,1,`translateX(0)`,i],[1050,1,`translateX(-108%)`],[r,1,`translateX(-108%)`]]),n(`.wing-right`,[[0,1,`translateX(0)`],[120,1,`translateX(0)`,i],[1050,1,`translateX(108%)`],[r,1,`translateX(108%)`]]),n(`.jamb-left`,[[0,1,`translateX(0) scale(1.6)`],[1400,1,`translateX(-115%) scale(1)`],[r,1,`translateX(-115%) scale(1)`]]),n(`.jamb-right`,[[0,1,`translateX(0) scale(1.6)`],[1400,1,`translateX(115%) scale(1)`],[r,1,`translateX(115%) scale(1)`]]),n(`.cine-atmosphere`,[[0,.25,`translateX(-4%) scale(1.1)`],[r,.38,`translateX(3%) scale(1.04)`]]),n(`.beat-initial`,[[0,0,`translateY(-8px)`],[700,1,`translateY(0)`],[1500,1,`translateY(0)`],[1800,0,`translateY(-5px)`],[r,0]]),n(`.beat-action`,[[0,0,`translateY(-5px)`],[1500,0,`translateY(-5px)`],[1900,1,`translateY(0)`],[e===`final3`?2850:3300,1,`translateY(0)`],[e===`final3`?3050:3550,0,`translateY(-4px)`],[r,0]]);let a={tiebreak:4800,final4:4900,ambush:4300,allPower:7200,shock:2500,final3:6900}[e];n(`.cine-titles`,[[0,0,`translateY(16px)`],[a,0,`translateY(16px)`],[a+550,1,`translateY(0)`],[r,1,`translateY(0)`]]),n(`.cine-sweep`,[[0,0,`translateX(-150%) skewX(-15deg)`],[a-250,0,`translateX(-150%) skewX(-15deg)`],[a+100,.35,`translateX(0) skewX(-15deg)`],[a+800,0,`translateX(200%) skewX(-15deg)`],[r,0]]);let o={tiebreak:[1900,3700],final4:[1900,3800],ambush:[2900],allPower:[2900],shock:[1800],final3:[2900]}[e],s=o[0],c=o[1],l=[[0,1,`translateX(-2%) translateY(2%) scale(1.22)`],[1100,1,`translateX(0) translateY(0) scale(1.04)`],[s-80,1,`translateX(1%) translateY(-1%) scale(1.1)`,`steps(1,end)`],[s,0,`translateX(1%) translateY(-1%) scale(1.1)`]],u=[[0,0,`translateX(-2%) translateY(1%) scale(1.12)`,`steps(1,end)`],[s,1,`translateX(-2%) translateY(1%) scale(1.12)`]];c?(l.push([c-80,0,`translateX(2%) translateY(0) scale(1.03)`,`steps(1,end)`],[c,1,`translateX(2%) translateY(0) scale(1.03)`],[r,1,`translateX(-1%) translateY(-1%) scale(1.11)`]),u.push([c-80,1,`translateX(0) translateY(-1%) scale(1.02)`,`steps(1,end)`],[c,0,`translateX(0) translateY(-1%) scale(1.02)`],[r,0])):(l.push([r,0]),u.push([s+750,1,`translateX(0) translateY(0) scale(1.02)`],[r,1,`translateX(1%) translateY(-1%) scale(1.065)`])),n(`.shot-wide`,l),n(`.shot-detail`,u);let d=[[0,0]],f=[[0,0,`translateX(-250%) rotateY(15deg)`]];for(let e of o)d.push([e-200,0],[e-65,1],[e+75,1],[e+340,0]),f.push([e-320,0,`translateX(-250%) rotateY(15deg)`],[e-120,1,`translateX(-20%) rotateY(0)`],[e+80,1,`translateX(130%) rotateY(-15deg)`],[e+400,0,`translateX(320%) rotateY(-15deg)`]);d.push([r,0]),f.push([r,0,`translateX(320%) rotateY(-15deg)`]),n(`.cine-cut`,d),n(`.transition-blade`,f);let p=e===`allPower`?2900:e===`ambush`?3400:o.at(-1);if(n(`.ring-a`,[[0,0,`scale(.3)`],[p-120,0,`scale(.3)`],[p+100,.6,`scale(.7)`],[p+750,0,`scale(1.8)`],[r,0]]),n(`.ring-b`,[[0,0,`scale(.4)`],[p,0,`scale(.4)`],[p+220,.4,`scale(.8)`],[p+950,0,`scale(2)`],[r,0]]),n(`.energy-core`,[[0,0],[p-80,0],[p+100,.4],[p+600,0],[r,0]]),(e===`tiebreak`||e===`final4`)&&(n(`.shot-detail .cine-token`,[[0,0,`translateY(-35px) rotate(-12deg) scaleY(.5)`],[1900,0,`translateY(-35px) rotate(-12deg) scaleY(.5)`],[2250,1,`translateY(3px) rotate(0) scaleY(.5)`],[2450,1,`translateY(0) rotate(0) scaleY(.5)`],[r,1,`translateY(0) rotate(0) scaleY(.5)`]]),n(`.shot-detail .cine-token-light`,[[0,0],[2200,0],[2450,.85],[r,.25]]),n(`.vote-flight`,[[0,0,`translateX(0) translateY(0) rotate(0) scaleY(.5)`],[c+50,0,`translateX(0) translateY(0) rotate(0) scaleY(.5)`],[c+220,1,`translateX(60%) translateY(-90%) rotate(8deg) scaleY(.5)`],[c+750,1,`translateX(330%) translateY(-70%) rotate(0) scale(.75) scaleY(.5)`],[c+920,0,`translateX(330%) translateY(-70%) rotate(0) scale(.75) scaleY(.5)`],[r,0]]),n(`.verdict-trail`,[[0,0,`scaleX(0)`],[c+100,0,`scaleX(0)`],[c+700,.8,`scaleX(1)`],[c+1100,.15,`scaleX(1)`],[r,.15]]),n(`.verdict-bracket`,[[0,0,`scaleY(.65)`],[c+700,0,`scaleY(.65)`],[c+1050,1,`scaleY(1)`],[r,1,`scaleY(1)`]]),n(`.tally-after`,[[0,0],[c+750,0],[c+1e3,1],[r,1]]),n(e===`tiebreak`?`.shot-wide .role-right .actor-badge`:`.shot-wide .f4-right .actor-badge`,[[0,1],[c+700,1],[c+1e3,0],[r,0]]),e===`tiebreak`?n(`.tally-before`,[[0,1],[1800,1],[1900,0],[c,0],[c+200,1],[c+750,1],[c+950,0],[r,0]]):(n(`.cine-small-shield`,[[0,0,`translateX(-50px) translateY(-8px) rotate(-15deg) scale(.6)`],[900,1,`translateX(0) translateY(0) rotate(-6deg) scale(1.08)`],[1400,1,`translateX(0) translateY(0) rotate(-6deg) scale(1)`],[r,1,`translateX(0) translateY(0) rotate(-6deg) scale(1)`]]),n(`.safety-spotlight`,[[0,0],[1e3,.75],[r,.4]]))),e===`ambush`&&(n(`.ambush-save-shield`,[[0,0,`translateX(-90px) translateY(-35px) rotate(-20deg) scale(.5)`],[900,0,`translateX(-90px) translateY(-35px) rotate(-20deg) scale(.5)`],[1500,1,`translateX(0) translateY(0) rotate(0) scale(1.08)`],[1900,1,`translateX(0) translateY(0) rotate(0) scale(1)`],[r,1,`translateX(0) translateY(0) rotate(0) scale(1)`]]),n(`.slot-open`,[[0,0],[1500,0],[1950,1],[r,1]]),n(`.ambush-original-left .actor-badge`,[[0,1],[1450,1],[1750,0],[r,0]]),n(`.cine-danger`,[[0,0],[3e3,0],[3650,.9],[r,.6]]),n(`.cine-danger-ring`,[[0,0,`scale(.7)`],[3200,0,`scale(.7)`],[3700,1,`scale(1)`],[r,.65,`scale(1)`]]),n(`.lock-left`,[[0,0,`translateX(-70px)`],[3300,0,`translateX(-70px)`],[3900,1,`translateX(0)`],[r,1,`translateX(0)`]]),n(`.lock-right`,[[0,0,`translateX(70px)`],[3300,0,`translateX(70px)`],[3900,1,`translateX(0)`],[r,1,`translateX(0)`]])),e===`ambush`||e===`final3`){let t=e===`final3`,i=t?6100:2900,a=t?6800:3500;n(`.gate-left`,[[0,1,`translateX(${t?-105:0}%)`],[i,1,`translateX(${t?-105:0}%)`],[a,1,`translateX(${t?0:-105}%)`],[r,1,`translateX(${t?0:-105}%)`]]),n(`.gate-right`,[[0,1,`translateX(${t?105:0}%) scaleX(-1)`],[i,1,`translateX(${t?105:0}%) scaleX(-1)`],[a,1,`translateX(${t?0:105}%) scaleX(-1)`],[r,1,`translateX(${t?0:105}%) scaleX(-1)`]])}e===`allPower`&&(n(`.power-award-shield`,[[0,0,`translateX(-140px) translateY(-40px) rotate(-30deg) scale(.5)`],[1200,0,`translateX(-140px) translateY(-40px) rotate(-30deg) scale(.5)`],[2050,1,`translateX(0) translateY(0) rotate(-8deg) scale(1.12)`],[2500,1,`translateX(0) translateY(0) rotate(-8deg) scale(1)`],[r,1,`translateX(0) translateY(0) rotate(-8deg) scale(1)`]]),n(`.royal-group`,[[0,1,`translateX(0) translateY(18px) scale(.97)`],[2900,1,`translateX(0) translateY(18px) scale(.97)`],[3650,1,`translateX(0) translateY(0) scale(1.015)`],[4400,1,`translateX(0) translateY(0) scale(1)`,`cubic-bezier(.55,.05,.65,1)`],[6600,1,`translateX(-140%) translateY(35%) scale(2.2)`],[r,1,`translateX(-140%) translateY(35%) scale(2.2)`]]),n(`.shot-detail .royal-room-plane`,[[0,1,`translateX(0) scale(1)`],[4400,1,`translateX(0) scale(1)`,`cubic-bezier(.55,.05,.65,1)`],[6600,1,`translateX(-3%) scale(3.2)`],[r,1,`translateX(-3%) scale(3.2)`]]),n(`.royal-aura`,[[0,0],[2900,0],[3550,.65],[r,.25]])),(e===`allPower`||e===`shock`)&&(n(`.city-plate, .eye-city-plate`,[[0,1,`translateX(-1%) scale(1.02)`],[r,1,`translateX(1%) scale(1.04)`]]),e===`allPower`?(n(`.royal-glass`,[[0,.3,`translateX(-1%)`],[r,.5,`translateX(1%)`]]),n(`.city-light`,[[0,.2],[1500,.6],[3200,.25],[4700,.65],[r,.3]])):(n(`.shot-wide .cine-world`,[[0,1,`translateY(0) scale(2.8)`],[1800,1,`translateY(0) scale(1.65)`],[r,1,`translateY(0) scale(1.65)`]]),n(`.cine-eye-bloom`,[[0,0],[1800,0],[2300,.8],[2900,.3],[r,.25]]),n(`.orbit-a`,[[0,0,`scale(.5) rotate(-20deg)`],[1850,0,`scale(.5) rotate(-20deg)`],[2400,.65,`scale(1) rotate(0deg)`],[3500,0,`scale(1.8) rotate(30deg)`],[r,0]]),n(`.orbit-b`,[[0,0,`scale(.6) rotate(20deg)`],[2050,0,`scale(.6) rotate(20deg)`],[2700,.5,`scale(1.1) rotate(0)`],[3800,0,`scale(2) rotate(-30deg)`],[r,0]]),n(`.shock-motif`,[[0,0,`translateY(15px) scale(.8)`],[2300,0,`translateY(15px) scale(.8)`],[2900,.9,`translateY(0) scale(1)`],[r,.9,`translateY(0) scale(1)`]]))),e===`final3`&&(n(`.final-decision`,[[0,0,`translateY(10px)`],[1700,0,`translateY(10px)`],[2200,1,`translateY(0)`],[r,1,`translateY(0)`]]),n(`.cine-departure`,[[0,1,`translateY(7%) scale(1)`],[2900,1,`translateY(7%) scale(1)`],[3550,1,`translateY(-8%) scale(.92)`],[4200,1,`translateY(-28%) scale(.8)`],[4800,1,`translateY(-47%) scale(.68)`],[5200,1,`translateY(-61%) scale(.6)`],[5900,1,`translateY(-82%) scale(.48)`],[r,1,`translateY(-82%) scale(.48)`]]),n(`.departure-near`,[[0,1],[5199,1,void 0,`steps(1,end)`],[5200,0],[r,0]]),n(`.departure-far`,[[0,0],[5199,0,void 0,`steps(1,end)`],[5200,1],[r,1]]),n(`.portal-floor-light`,[[0,.3],[2900,.3],[5200,.65],[6800,.2],[r,.2]]))}var M=[`exit`,`tiebreak`,`final4`,`final3`],ie=[`cinema_hall`,`cinema_portal`,`cinema_exitC`,`cinema_avatarC`,`cinema_eliminatedStamp`],ae=[`cinema_standA`,`cinema_standB`,`cinema_standC`,`cinema_decisionA`,`cinema_decisionB`],N=Object.fromEntries(M.map(e=>{let t=e===`final4`||e===`final3`,n=e===`exit`?0:t?4400:3200,r=n+4600;return[e,{duration:r+5600,exitAt:n,avatarAt:r,art:[...ie,...e===`exit`?[]:ae,...[`final4`,`exit`].includes(e)?[]:[`cinema_crown`]],description:e===`exit`?`The new Hub exit: a continuous walk through the doorway, doors close, then the camera pushes into the exit and hands off to the game’s portrait elimination treatment.`:(e===`final4`?`The Safety holder faces the two nominees; the protected LOH stays off-stage.`:e===`final3`?`The final LOH faces the other two finalists.`:`The LOH faces both nominees after a 4–4 tie.`)+` A decision isolates Player C in light. They leave through the Hub doors, followed by a camera push into the familiar avatar elimination treatment.`,beats:[...n?[[`00.0`,e===`final4`?`Safety holder faces the two nominees`:`The LOH faces both nominees`],[t?`03.2`:`01.9`,`The decision lands; only the eliminated player stays lit`]]:[],[(n/1e3).toFixed(1),`A continuous walk through the Hub exit`],[((n+3900)/1e3).toFixed(1),`Doors close; the camera approaches`],[(r/1e3).toFixed(1),`The game’s avatar elimination treatment`]],moments:n?[1100,...t?[2100,3100,3900]:[2650],n+1800,n+3400,r+2700]:[1100,2600,4e3,r+2700]}]})),P=(e,t,n=`props`)=>`<img data-resource="`+e+`" class="`+t+` cine-layer" data-layer="`+n+`" alt="">`,F=(e,t,n)=>`<div class="decision-person `+t+` cine-layer" data-layer="actors"><i class="decision-contact"></i>`+P(e,`decision-body`,`actors`)+`<span class="decision-badge">`+n+`</span></div>`;function I(e,t,n=0,{nativeHandoff:r=!1}={}){let i=e===`final4`||e===`final3`,a=g[n]||g[0],o=e===`final4`?a[1]:a[0],s=e===`final4`?a[0]:a[1],c=`PLAYER `+o.toUpperCase(),l=h[o].poses.decisionBack,u=document.createElement(`div`);u.className=`c-scene cinema-v2 cinema-v3 cinema-v4 decision-film film-`+e,u.dataset.cast=n,u.dataset.evictee=`c`,i&&u.classList.add(`suspense-decision`),u.setAttribute(`aria-hidden`,`true`);let d=e===`final4`?`SAFETY HOLDER · SOLE VOTE`:`LEADER OF THE HUB`,f=e=>`<div class="cine-departure `+e+` cine-layer" data-layer="actors">`+P(`cinema_exitC`,`cine-rear`,`actors`)+`</div>`;u.innerHTML=(e===`exit`?``:`<div class="decision-shot"><div class="decision-camera">`+P(`cinema_hall`,`decision-bg`,`set`)+`<div class="decision-room-dim cine-layer" data-layer="light"></div>`+F(h[s].poses.ceremonyFront,`decision-survivor`,`PLAYER `+s.toUpperCase()+` · NOMINEE`)+`<div class="decision-survivor-shade"></div><div class="decision-spotlight cine-layer" data-layer="light"></div>`+F(`cinema_standC`,`decision-evictee`,`PLAYER C · NOMINEE`)+F(l,`decision-holder`,c+` · `+d)+(e===`final4`?``:P(`cinema_crown`,`decision-insignia crown`))+`<div class="decision-holder-shade"></div></div><div class="decision-intro cine-layer" data-layer="titles">`+(e===`tiebreak`?`4–4 · THE LOH BREAKS THE TIE`:e===`final4`?`FINAL FOUR · THE LOH IS ALREADY SAFE`:`FINAL THREE · THE LOH MUST CHOOSE`)+`</div><div class="decision-verdict cine-layer" data-layer="titles"><span>`+c+(e===`final4`?` CASTS THE ONLY VOTE`:` MAKES THE DECISION`)+`</span><h3>Player C</h3><p>`+(e===`tiebreak`?`ELIMINATED · 5–4`:e===`final4`?`ELIMINATED · 1–0`:`ELIMINATED · THIRD PLACE`)+`</p></div></div>`)+(i?`<div class="decision-suspense cine-layer" data-layer="titles">`+(e===`final4`?`ONE VOTE. NO WAY BACK.`:`ONE PLACE IN THE FINAL TWO.`)+`</div>`:``)+`<div class="exit-shot"><div class="exit-camera">`+P(`cinema_hall`,`exit-background`,`set`)+f(`departure-near`)+`<div class="doorway-volume">`+f(`departure-far`)+`</div><div class="cine-gates cine-layer" data-layer="props">`+P(`cinema_portal`,`cine-gate gate-left`)+P(`cinema_portal`,`cine-gate gate-right`)+`</div><div class="exit-light cine-layer" data-layer="light"></div></div><div class="exit-caption cine-layer" data-layer="titles"><span>PLAYER C</span><h3>One last goodbye.</h3><p>LEAVING THE HUB</p></div></div><div class="decision-cut cine-layer" data-layer="light"></div><div class="handoff-veil cine-layer" data-layer="light"></div>`+(r?``:`<div class="avatar-sequence"><div class="avatar-stage"><div class="avatar-dim"></div><div class="avatar-hero cine-layer" data-layer="actors">`+P(`cinema_avatarC`,`avatar-photo avatar-colour`,`actors`)+P(`cinema_avatarC`,`avatar-photo avatar-grade`,`actors`)+`<div class="avatar-vignette"></div><div class="avatar-scanlines"></div></div><div class="avatar-live cine-layer" data-layer="titles">LIVE</div><div class="avatar-lower-third cine-layer" data-layer="titles"><span>`+(e===`final3`?`THIRD PLACE`:`ELIMINATED FROM THE HUB`)+`</span><h3>Player C</h3></div>`+P(`cinema_eliminatedStamp`,`avatar-stamp`,`titles`)+`<div class="avatar-roster-label">PLAYER C · ELIMINATED</div></div></div>`)+`<div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>`;for(let e of u.querySelectorAll(`[data-resource]`)){let n=e.dataset.resource;if(!t[n])throw Error(`Missing resource `+n);let r=t[n].cloneNode();r.className=e.className,r.dataset.layer=e.dataset.layer,r.dataset.resource=n,r.alt=``,r.draggable=!1,e.replaceWith(r)}let p=u.querySelector(`.decision-holder`);if(p){let e=u.querySelector(`.decision-insignia`);e&&p.append(e);for(let e of u.querySelectorAll(`.decision-holder,.decision-survivor`)){let t=e.querySelector(`.decision-body`).cloneNode();t.classList.add(`decision-dark-body`),e.insertBefore(t,e.querySelector(`.decision-badge`))}}return u}function L(e,t,n,{nativeHandoff:r=!1}={}){let i=e===`final4`||e===`final3`,a=t.classList.contains(`paired-film`),{duration:o,exitAt:s,avatarAt:c}=N[e],l=`cubic-bezier(.16,1,.3,1)`,u=(e,t)=>n(e,[...t,[o,t.at(-1)[1],t.at(-1)[2]]]);if(n(t,[[0,1],[o-220,1],[o,0]]),s){u(`.decision-shot`,[[0,1],[s-1,1,void 0,`steps(1,end)`],[s,0]]),u(`.decision-camera`,i?[[0,1,`translateY(1%) scale(1.08)`,l],[850,1,`translateX(0) translateY(0) scale(1)`,`cubic-bezier(.45,0,.25,1)`],[1750,1,`translateX(8%) translateY(2%) scale(1.18)`],[2250,1,`translateX(8%) translateY(2%) scale(1.18)`,`cubic-bezier(.45,0,.25,1)`],[3150,1,`translateX(-24%) translateY(5%) scale(1.42)`],[s,1,`translateX(-27%) translateY(6%) scale(1.5)`]]:[[0,1,`translateY(2%) scale(1.13)`,l],[1050,1,`translateY(0) scale(1)`],[1900,1,`translateX(0) scale(1)`],[2900,1,`translateX(-3%) scale(1.07)`]]);let e=(e,t)=>u(e,t.map(([e,...t])=>[i&&e>=1700?e+(e<=1900?900:1e3):e,...t]));i&&u(`.decision-suspense`,[[0,0,`translateY(5px)`],[1750,0,`translateY(5px)`],[2150,.8,`translateY(0)`],[2550,.8],[2900,0]]),u(`.decision-intro`,[[0,0,`translateY(-12px)`],[650,1,`translateY(0)`],[1550,1],[1850,0]]),e(`.decision-holder`,[[0,1,`translateX(-4%) rotate(-2deg)`,l],[1300,1,`translateX(0) rotate(0deg)`],[1700,1,`translateX(0) rotate(0deg)`],[2150,1,`translateX(1%) rotate(1deg)`]]),e(`.decision-room-dim`,[[0,0],[1800,0],[2250,.82]]),e(`.decision-holder-shade`,[[0,0],[1900,0],[2350,.77]]),e(`.decision-holder .decision-dark-body`,[[0,0],[1900,0],[2350,1]]),e(`.decision-holder .decision-badge,.decision-holder .decision-insignia,.decision-survivor .decision-badge`,[[0,1],[1900,1],[2350,.18]]),e(`.decision-survivor .decision-dark-body`,[[0,0],[1850,0],[2300,1]]),e(`.decision-survivor-shade`,[[0,0],[1850,0],[2300,.82]]),e(`.decision-spotlight`,[[0,0,`scaleX(.65)`],[1800,0,`scaleX(.65)`],[2300,.8,`scaleX(1)`]]),e(`.decision-verdict`,[[0,0,`translateY(16px)`],[2150,0,`translateY(16px)`,l],[2600,1,`translateY(0)`]]),u(`.decision-cut`,[[0,0],[s-180,0],[s-45,1],[s+65,1],[s+310,0]])}u(`.exit-shot`,[[0,+!s,void 0,`steps(1,end)`],...s?[[s,1]]:[],[c+120,1,void 0,`steps(1,end)`],[c+121,0]]);let d=[[s,1,`translateY(7%) scale(1)`],...a?[[s+650,1,`translateY(2%) scale(.98)`],[s+1300,1,`translateY(-12%) scale(.9)`],[s+1900,1,`translateY(-30%) scale(.78)`],[s+2300,1,`translateY(-46%) scale(.65)`],[s+3e3,1,`translateY(-63%) scale(.55)`],[s+3400,1,`translateY(-67%) scale(.52)`]]:[[s+650,1,`translateY(-8%) scale(.92)`],[s+1300,1,`translateY(-28%) scale(.8)`],[s+1900,1,`translateY(-47%) scale(.68)`],[s+2300,1,`translateY(-61%) scale(.6)`],[s+3e3,1,`translateY(-82%) scale(.48)`]]];for(let e of[`.departure-near`,`.departure-far`])n(e,[[0,1,`translateY(7%) scale(1)`],...d.filter(e=>e[0]>0),[o,1,d.at(-1)[2]]]);let f=a?s+3e3:s+2300;u(`.departure-near .cine-rear`,[[0,1],[f-1,1,void 0,`steps(1,end)`],[f,0]]),u(`.departure-far .cine-rear`,[[0,0,void 0,`steps(1,end)`],[f,1]]);for(let[e,t,n]of[[`.gate-left`,-1,``],[`.gate-right`,1,` scaleX(-1)`]]){let r=`translateX(`+t*105+`%)`+n,i=`translateX(0)`+n;u(e,a?[[0,1,i],[s+500,1,r],[s+3300,1,r,`cubic-bezier(.45,0,.2,1)`],[s+3900,1,i]]:[[0,1,r],[s+3200,1,r,`cubic-bezier(.45,0,.2,1)`],[s+3900,1,i]])}u(`.exit-camera`,[[0,1,`scale(1.02)`],[s+3300,1,`scale(1.02)`],[s+3900,1,`scale(1.05)`,`cubic-bezier(.6,.05,.55,1)`],[c+140,1,`scale(4.8)`]]),u(`.exit-light`,[[0,.5],[s+3e3,.35],[s+3900,.05]]),u(`.exit-caption`,[[0,0],[s+250,0,`translateY(10px)`],[s+750,1,`translateY(0)`],[s+3e3,1],[s+3450,0]]),u(`.handoff-veil`,[[0,0],[c-200,0],[c+40,.96],[c+170,.96],[c+470,0]]),!r&&(u(`.avatar-sequence`,[[0,0,void 0,`steps(1,end)`],[c+80,1]]),u(`.avatar-hero`,[[0,1,`translateY(-8%) scale(1.12)`],[c+80,1,`translateY(-8%) scale(1.12)`,l],[c+560,1,`translateY(0) scale(1)`],[c+4800,1,`translateY(0) scale(1)`,`cubic-bezier(.25,.46,.45,.94)`],[c+5400,1,`translateY(30%) scale(.19)`]]),u(`.avatar-photo`,[[0,1,`translateY(0) scale(1)`],[c+900,1,`translateY(0) scale(1)`],[c+1800,1,`translateY(-1%) scale(1.04)`]]),u(`.avatar-grade`,[[0,0],[c+1800,0],[c+2150,1]]),u(`.avatar-vignette`,[[0,0],[c+1800,0],[c+2150,1]]),u(`.avatar-live`,[[0,0],[c+750,0],[c+900,1],[c+4650,1],[c+4800,0]]),u(`.avatar-lower-third`,[[0,0,`translateY(110%)`],[c+2100,0,`translateY(110%)`],[c+2320,1,`translateY(0)`],[c+4650,1],[c+4800,0,`translateY(110%)`]]),u(`.avatar-stamp`,[[0,0,`translate(-50%,-50%) scale(2.4) rotate(-14deg)`],[c+2160,0,`translate(-50%,-50%) scale(2.4) rotate(-14deg)`],[c+2390,1,`translate(-50%,-50%) scale(.96) rotate(-12deg)`],[c+2490,1,`translate(-50%,-50%) scale(1) rotate(-12deg)`],[c+4650,1,`translate(-50%,-50%) scale(1) rotate(-12deg)`],[c+4770,0,`translate(-50%,-50%) scale(.7) rotate(-12deg)`]]),u(`.avatar-roster-label`,[[0,0],[c+5200,0],[c+5400,1]]))}var R={duration:8400,art:[`cinema_shockRoom`,`cinema_city`],description:`The Eye crashes into the normal city view with one purple-gold impact and a brief camera recoil. The Hub falls dark, the iris turns, and a smooth pullback becomes the actual Shock announcement. Shared across all shock types.`,beats:[[`00.0`,`A normal moment in the Hub`],[`00.2`,`The Eye forces its way in`],[`00.6`,`The lights die; the Hub is interrupted`],[`01.3`,`The iris turns and the Eye takes control`],[`03.5`,`The actual Shock is revealed`]],moments:[100,350,1150,2250,3800,5600]},z=(e,t,n,r)=>{let i=e[t].cloneNode();return i.className=n+` cine-layer`,i.dataset.layer=r,i.alt=``,i.draggable=!1,i};function oe(e,t){let n=document.createElement(`div`);n.className=`c-scene cinema-v2 cinema-v3 shock-film film-shock`,n.dataset.shock=t.tone,n.dataset.motif=t.motif,n.setAttribute(`aria-hidden`,`true`),n.innerHTML=`<div class="shock-chamber"><div class="shock-lens"><div class="shock-city-window"></div><div class="shock-room-plane"></div><div class="shock-iris"></div><div class="shock-chamber-shadow cine-layer" data-layer="light"></div><div class="shock-eye-light cine-layer" data-layer="light"></div><div class="shock-breath cine-layer" data-layer="light"></div></div></div><div class="shock-blackout cine-layer" data-layer="light"></div><div class="shock-hush cine-layer" data-layer="titles">THE HUB FALLS SILENT</div><div class="shock-presence cine-layer" data-layer="titles">THE EYE HAS TAKEN CONTROL.</div><div class="cine-titles cine-layer" data-layer="titles"><span>THE BIG EYE · SHOCK ANNOUNCEMENT</span><h3 class="shock-title"></h3><i class="shock-rule"></i><p class="shock-copy"></p></div><div class="shock-edge-shade"></div><div class="cine-letterbox letterbox-top"></div><div class="cine-letterbox letterbox-bottom"></div><div class="cine-sequence">THE BIG EYE <i></i> CEREMONY FILM</div>`;let r=document.createElement(`div`);r.className=`shock-interrupted-feed cine-layer`,r.dataset.layer=`set`,r.append(z(e,`cinema_city`,`shock-feed-city`,`set`)),n.prepend(r);let i=document.createElement(`div`);return i.className=`shock-clash-light cine-layer`,i.dataset.layer=`light`,n.append(i),n.querySelector(`.shock-city-window`).append(z(e,`cinema_city`,`shock-city`,`set`)),n.querySelector(`.shock-room-plane`).append(z(e,`cinema_shockRoom`,`shock-wall eye-window-room`,`set`)),n.querySelector(`.shock-iris`).append(z(e,`cinema_shockRoom`,`shock-iris-texture`,`set`)),n.querySelector(`.shock-title`).textContent=t.title,n.querySelector(`.shock-copy`).textContent=t.copy,n}function se(e,t){let n=R.duration,r=`cubic-bezier(.4,0,.2,1)`,i=`cubic-bezier(.16,1,.3,1)`,a=(e,r)=>t(e,r.at(-1)[0]===n?r:[...r,[n,r.at(-1)[1],r.at(-1)[2]]]);t(e,[[0,1],[n-320,1],[n,0]]),a(`.shock-interrupted-feed`,[[0,1],[219,1,void 0,`steps(1,end)`],[220,0]]),a(`.shock-chamber`,[[0,0,`translateY(2%) scale(2.92)`,`steps(1,end)`],[220,1,`translateY(2%) scale(2.92)`,i],[580,1,`translateY(2%) scale(2.6)`,r],[1400,1,`translateY(1%) scale(2.56)`,r],[3300,1,`translateY(0) scale(1.04)`],[n,1,`translateY(-.4%) scale(1.075)`]]),a(`.shock-lens`,[[0,1,`translate(0,0)`],[220,1,`translate(-6px,4px) rotate(-.35deg)`],[280,1,`translate(4px,-2px) rotate(.25deg)`],[350,1,`translate(-3px,1px) rotate(-.15deg)`],[440,1,`translate(1px,0) rotate(.05deg)`],[580,1,`translate(0,0) rotate(0)`]]),a(`.shock-clash-light`,[[0,0,`scale(.98)`],[200,0,`scale(.98)`],[265,.62,`scale(1)`],[520,0,`scale(1.04)`]]),a(`.shock-blackout`,[[0,0],[200,0],[380,.68],[820,.91],[1080,.91],[1900,.16],[2850,0]]),a(`.shock-chamber-shadow`,[[0,.14],[450,.14],[950,.7],[3300,.73]]),a(`.shock-city`,[[0,.9,`translateY(0) scale(1.03)`],[580,.9,`translateY(0) scale(1.03)`],[1150,.06,`translateY(0) scale(1.03)`],[n,.025,`translateY(-1%) scale(1.05)`]]),a(`.shock-iris`,[[0,1,`rotate(0deg)`],[900,1,`rotate(0deg)`,r],[3e3,1,`rotate(34deg)`],[n,1,`rotate(39deg)`]]),a(`.shock-eye-light`,[[0,0],[1050,0],[1850,.65],[2850,.29],[3800,.42],[6e3,.23]]),a(`.shock-breath`,[[0,0,`translateX(-3%)`],[1450,0,`translateX(-3%)`],[3100,.17,`translateX(0)`],[6500,.23,`translateX(3%)`]]),a(`.shock-hush`,[[0,0,`translateY(3px)`],[670,0,`translateY(3px)`],[1040,.85,`translateY(0)`],[1500,.85],[2050,0]]),a(`.shock-presence`,[[0,0,`translateY(7px)`],[1900,0,`translateY(7px)`,i],[2600,.9,`translateY(0)`],[3150,.9],[3500,0,`translateY(-3px)`]]),a(`.cine-titles`,[[0,0,`translateY(14px) scale(.985)`],[3450,0,`translateY(14px) scale(.985)`,i],[4200,1,`translateY(0) scale(1)`]]),a(`.shock-title`,[[0,1,`translateY(9px)`],[3450,1,`translateY(9px)`,i],[4400,1,`translateY(0)`]]),a(`.shock-rule`,[[0,0,`scaleX(0)`],[3880,0,`scaleX(0)`],[4580,.75,`scaleX(1)`]]),a(`.shock-copy`,[[0,0,`translateY(5px)`],[4100,0,`translateY(5px)`],[4650,1,`translateY(0)`]])}var B=[...new Set([..._,...M])],ce={...b,...N,shock:R};function le(e,t,n,r=0){return M.includes(e)?I(e,t,r):e===`shock`?oe(t,n):ne(e,t,n,r)}function ue(e,t,n){if(M.includes(e))return L(e,t,n);if(e===`shock`)return se(t,n);re(e,t,n)}var V={safety:{label:`Winning Safety`,number:`01`,title:`Power becomes protection.`,subtitle:`The shield chooses its knight.`,duration:4200,art:[`male`,`shield`,`knight`,`cinema_sanctuary`],description:`The winner receives the Power of Safety. A shield flies into place, then a purple-and-gold camera flash reveals a knight holding it.`,beats:[[`00.0`,`The winner steps forward`],[`00.8`,`The shield arrives`],[`01.7`,`A knight of Safety is revealed`]],moments:[1200,2600,3500]},nominations:{label:`Nominations`,number:`02`,title:`A place on the edge.`,subtitle:`Two nominees. One uncertain future.`,duration:4800,art:[`male`,`female`,`platform`,`cinema_danger`],description:`Two suspended stone ledges hang over a dark chasm. Each nominee is revealed in turn, then both remain in view above the danger below.`,beats:[[`00.4`,`The first nominee takes the ledge`],[`01.6`,`The second nominee is revealed`],[`02.6`,`Both are left on the edge`]],moments:[1100,2300,3500]},save:{label:`Saved by Safety`,number:`03`,title:`A way back to safety.`,subtitle:`One shield. A second chance.`,duration:4500,art:[`female`,`platform`,`shield`,`cinema_sanctuary`],description:`The nominee begins on a danger ledge. Safety arrives, breaks the red danger frame, and lets the ledge fall away. The player remains protected in warm light.`,beats:[[`00.0`,`A nominee stands in danger`],[`01.2`,`Safety reaches the player`],[`01.9`,`The block breaks away`]],moments:[900,1700,3200]},exit:{label:`Leaving the Hub`,number:`04`,title:`One last goodbye.`,subtitle:`The door closes. Their chapter ends.`,duration:5e3,art:[`door`,`departing`],description:`The departing player carries a bag and suitcase toward the Hub exit. They disappear through the doorway, the door swings shut, and the scene fades to darkness.`,beats:[[`00.0`,`Bags packed. A last walk out.`],[`02.1`,`Through the exit doorway`],[`03.3`,`The door closes, then darkness`]],moments:[1e3,2650,3900]},tiebreak:{label:`Tiebreak`,number:`05`,title:`The deciding vote.`,subtitle:`One final choice breaks the tie.`,duration:4200,art:[`male`,`female`,`scales`],description:`The tied nominees stand across a ceremonial balance. A single golden LOH vote lands, the scales tilt, and the decided outcome is revealed.`,beats:[[`00.4`,`Two nominees. Equal footing.`],[`01.4`,`The LOH casts the deciding vote`],[`02.4`,`The balance tips`]],moments:[900,2100,3300]},ambush:{label:`Ambush`,number:`06`,title:`You never saw it coming.`,subtitle:`The hidden target steps into danger.`,duration:4300,art:[`male`,`female`,`finalist`,`platform`,`curtain`],description:`The initial nominees hold their places. A hidden target appears from behind the Hub curtains as a new danger ledge rises beneath them: the true ambush nominee.`,beats:[[`00.5`,`The block appears settled`],[`01.8`,`The curtain parts`],[`02.5`,`A new name is on the block`]],moments:[1200,2450,3500]},allPower:{label:`All the Power`,number:`07`,title:`The sovereign.`,subtitle:`Leader and Safety holder. One player.`,duration:4200,art:[`seatedKing`,`shield`,`eyeSeal`],description:`The crowned Leader sits on the throne as the Safety shield joins the scene. Both powers flare together behind the Hub’s sovereign.`,beats:[[`00.5`,`The Leader takes the throne`],[`01.4`,`Safety joins the crown`],[`02.5`,`All the power, in one seat`]],moments:[900,2200,3400]},shock:{label:`Shock announcement`,number:`08`,title:`The Eye interrupts.`,subtitle:`Choose a real shock type to preview.`,duration:3400,art:[`eyeSeal`,`curtain`],shock:!0,description:`A single fast broadcast reveal adapts to the selected shock: its real announcement title and copy appear with a matching color and light cue. No extra generated clip per twist.`,beats:[[`00.0`,`The Hub lights dip`],[`00.8`,`The Eye opens`],[`01.4`,`The twist is announced`]],moments:[500,1300,2400]},final4:{label:`Final 4 Safety`,number:`09`,title:`One vote. Two nominees.`,subtitle:`The protected LOH is off-stage.`,duration:4400,art:[`male`,`female`,`finalist`,`shield`],description:`Only the three eligible players appear. The LOH is already safe and is not shown as a participant. One golden ballot is cast and the selected player is revealed.`,beats:[[`00.3`,`Three eligible players enter`],[`01.5`,`The sole vote is cast`],[`02.5`,`One journey ends`]],moments:[1100,2300,3500]},final3:{label:`Final 3 elimination`,number:`10`,title:`The final invitation.`,subtitle:`The LOH chooses who finishes third.`,duration:5e3,art:[`male`,`female`,`finalist`,`crown`,`door`],description:`The crowned LOH faces the other two finalists. A royal decree selects the third-place finisher, who leaves through the Hub exit as the last two step into the finale.`,beats:[[`00.5`,`Three journeys remain`],[`01.9`,`The LOH makes the final choice`],[`03.0`,`A finalist exits. Two remain.`]],moments:[1200,2550,4300]}};for(let[e,t]of Object.entries(ce))V[e]={...V[e],...t,cinema:!0};var H={doubleEviction:{label:`Double Elimination`,title:`DOUBLE ELIMINATION`,copy:`Two exits. One night.`,tone:`danger`,motif:`slashes`},voxDouble:{label:`Vox Populi Double Elimination`,title:`THE PUBLIC DECIDES`,copy:`The audience will eliminate two.`,tone:`danger`,motif:`pulse`},dayStartShock:{label:`Morning Shock`,title:`MORNING SHOCK`,copy:`A new day. A sudden exit.`,tone:`dawn`,motif:`sunrise`},battleBack:{label:`Back 2 the Game`,title:`BACK 2 THE GAME`,copy:`One eliminated player may return.`,tone:`gold`,motif:`return`},battleBackRules:{label:`Back 2 the Game Rules`,title:`THE RULES HAVE CHANGED`,copy:`Only one can earn a way back.`,tone:`gold`,motif:`return`},battleBackChallenge:{label:`Back 2 the Game Challenge`,title:`THE RETURN CHALLENGE`,copy:`The showdown starts now.`,tone:`gold`,motif:`return`},vip:{label:`Double Trouble Safety`,title:`DOUBLE TROUBLE`,copy:`Safety can be used twice.`,tone:`violet`,motif:`twin-shields`},diamond:{label:`Halo Exchange Safety`,title:`HALO EXCHANGE`,copy:`The Safety holder names the replacement.`,tone:`violet`,motif:`halo`},coup:{label:`Detox Safety`,title:`DETOX`,copy:`Both nominees are cleared. Two replacements.`,tone:`danger`,motif:`cleared`},spotlight:{label:`Force Majeure Safety`,title:`FORCE MAJEURE`,copy:`The Safety power must be used.`,tone:`gold`,motif:`spotlight`},democracia:{label:`Democracia`,title:`DEMOCRACIA`,copy:`The Hub elects its new Leader.`,tone:`gold`,motif:`ballots`},twinShock:{label:`Twin Shock`,title:`TWIN SHOCK`,copy:`Two new faces change the game.`,tone:`violet`,motif:`twins`},depressionShock:{label:`Depression Shock`,title:`DEPRESSION SHOCK`,copy:`The Hub’s mood takes a turn.`,tone:`storm`,motif:`storm`},cupidArrow:{label:`Cupid’s Arrow`,title:`CUPID’S ARROW`,copy:`The Hub is bound into pairs.`,tone:`rose`,motif:`arrows`},cupidBroken:{label:`Cupid’s Spell Is Broken`,title:`THE SPELL IS BROKEN`,copy:`The pairs are over. Everyone plays alone.`,tone:`rose`,motif:`broken-heart`},generic:{label:`General Shock Alert`,title:`SHOCK ALERT!`,copy:`The Big Eye has a surprise.`,tone:`violet`,motif:`pulse`}},U=(e,t)=>`<span data-art="`+e+`" class="`+t+`"></span>`,W=(e,t,n,r=``)=>`<div class="c-caption `+r+`"><span>`+e+`</span><strong>`+t+`</strong><em>`+n+`</em></div>`,G=(e,t,n)=>`<div class="nom-pod `+n+`"><div class="nom-aura"></div>`+U(e,`nom-person`)+U(`platform`,`nom-platform`)+`<div class="nom-label"><span>0`+t+`</span>NOMINATED</div></div>`;function de(e,t,n,r=0){if(B.includes(e))return le(e,t,n,r);let i=document.createElement(`div`);i.className=`c-scene c-`+e,i.setAttribute(`aria-hidden`,`true`),e===`safety`&&(i.innerHTML=`<div class="c-halo safety-halo"></div><div class="safety-arch"></div><div class="c-ground"></div>`+U(`male`,`safety-ordinary c-hero`)+U(`knight`,`safety-knight c-hero`)+U(`shield`,`safety-flying-shield`)+`<div class="c-wash"></div>`+W(`THE POWER OF SAFETY`,`Knight of Safety`,`THE SHIELD IS YOURS.`)),e===`nominations`&&(i.innerHTML=`<div class="nom-chasm"></div><div class="nom-warning">THE NOMINATION CEREMONY</div>`+G(`male`,1,`nom-first`)+G(`female`,2,`nom-second`)+W(`ON THE EDGE`,`Two names. One block.`,`THEIR FUTURE HANGS IN THE BALANCE.`)),e===`save`&&(i.innerHTML=`<div class="c-halo save-danger-halo"></div><div class="c-halo save-safe-halo"></div><div class="c-ground save-ground"></div>`+U(`shield`,`save-shield`)+U(`platform`,`save-platform`)+U(`female`,`save-person c-hero`)+`<div class="save-bracket save-bracket-left"></div><div class="save-bracket save-bracket-right"></div><div class="c-wash"></div>`+W(`ON THE BLOCK`,`One chance to stay.`,`NOMINATED`,`save-danger-caption`)+W(`SAVED BY THE POWER OF SAFETY`,`Off the block.`,`YOUR STORY ISN’T OVER.`,`save-safe-caption`)),e===`exit`&&(i.innerHTML=`<div class="exit-room-light"></div><div class="exit-door-set"><div class="exit-void"></div></div><div class="exit-far-wrap">`+U(`departing`,`exit-traveler exit-far`)+`</div><div class="exit-door-set exit-door-front"><div class="exit-leaf"><span class="exit-leaf-emblem">◉</span><i class="exit-handle"></i></div>`+U(`door`,`exit-frame`)+`</div>`+U(`departing`,`exit-traveler exit-near`)+`<div class="exit-sign">HUB EXIT</div>`+W(`THE END OF THIS CHAPTER`,`One last goodbye.`,`YOU LEFT YOUR MARK ON THE HUB.`)+`<div class="exit-blackout"></div>`),e===`tiebreak`&&(i.innerHTML=`<div class="tie-halo"></div><div class="tie-vote-line"></div>`+U(`scales`,`tie-scales`)+`<div class="tie-candidate tie-left">`+U(`male`,`tie-person`)+`<span>THE NOMINEES</span><strong>01</strong></div><div class="tie-candidate tie-right">`+U(`female`,`tie-person`)+`<span>THE NOMINEES</span><strong>02</strong></div><div class="tie-token">LOH<br>VOTE</div>`+W(`THE DECIDING VOTE`,`The tie is broken.`,`THE LOH MAKES THE CALL.`)),e===`ambush`&&(i.innerHTML=`<div class="ambush-curtains">`+U(`curtain`,`ambush-curtain ambush-curtain-left`)+U(`curtain`,`ambush-curtain ambush-curtain-right`)+`</div><div class="ambush-beam"></div><div class="ambush-side-nominees">`+U(`male`,`ambush-small`)+U(`female`,`ambush-small`)+`<span>THE BLOCK</span></div>`+U(`platform`,`ambush-platform`)+U(`finalist`,`ambush-target`)+`<div class="ambush-stamp">AMBUSH<br><b>NOMINATED</b></div>`+W(`THE BLOCK JUST CHANGED`,`A new nominee.`,`THE AMBUSH IS REVEALED.`)),e===`allPower`&&(i.innerHTML=`<div class="power-aura"></div>`+U(`eyeSeal`,`power-eye`)+U(`seatedKing`,`power-king`)+U(`shield`,`power-shield`)+`<div class="power-label"><span>LEADER OF THE HUB</span><b>+</b><span>POWER OF SAFETY</span></div>`+W(`ONE PLAYER HOLDS IT ALL`,`The sovereign.`,`ALL THE POWER.`)),e===`shock`&&(i.innerHTML=`<div class="shock-curtains">`+U(`curtain`,`shock-curtain shock-curtain-left`)+U(`curtain`,`shock-curtain shock-curtain-right`)+`</div><div class="shock-rays"></div>`+U(`eyeSeal`,`shock-eye`)+`<div class="shock-card"><span>THE BIG EYE INTERRUPTS</span><strong class="shock-title"></strong><em class="shock-copy"></em></div>`+W(`A TWIST CHANGES EVERYTHING`,`Shock announcement`,`THE HUB WILL NEVER BE THE SAME.`)),e===`final4`&&(i.innerHTML=`<div class="f4-arch"></div><div class="f4-eligible">THREE ELIGIBLE PLAYERS · LOH ALREADY SAFE</div><div class="f4-row"><div class="f4-player f4-one">`+U(`male`,`f4-person`)+`<span>01</span></div><div class="f4-player f4-two">`+U(`female`,`f4-person`)+`<span>02</span></div><div class="f4-player f4-three">`+U(`finalist`,`f4-person`)+`<span>03</span></div></div><div class="f4-ballot">THE<br>SOLE<br>VOTE</div>`+W(`FINAL FOUR · SOLE VOTE`,`One journey ends.`,`THREE ELIGIBLE PLAYERS. THE LOH IS SAFE.`)),e===`final3`&&(i.innerHTML=`<div class="f3-arch"></div><div class="f3-title">THE FINAL THREE</div><div class="f3-player f3-loh">`+U(`male`,`f3-person`)+U(`crown`,`f3-crown`)+`<span>LOH</span></div><div class="f3-player f3-left">`+U(`female`,`f3-person`)+`<span>FINALIST</span></div><div class="f3-player f3-right">`+U(`finalist`,`f3-person`)+`<span>FINALIST</span></div><div class="f3-decree">THE LOH’S<br>DECISION</div>`+U(`door`,`f3-door`)+W(`THE FINAL TWO`,`The final invitation.`,`THE LOH CHOSE WHO FINISHED THIRD.`)+`<div class="f3-blackout"></div>`),[`safety`,`nominations`,`save`].includes(e)&&i.insertAdjacentHTML(`afterbegin`,U(e===`nominations`?`cinema_danger`:`cinema_sanctuary`,`ceremony-backdrop`)+`<div class="ceremony-backdrop-shade"></div>`);for(let e of i.querySelectorAll(`[data-art]`)){let n=t[e.dataset.art].cloneNode();n.className=e.className,n.alt=``,n.draggable=!1,e.replaceWith(n)}return e===`shock`&&n&&(i.dataset.shock=n.tone,i.querySelector(`.shock-title`).textContent=n.title,i.querySelector(`.shock-copy`).textContent=n.copy),i}function fe(e,t,n,r){if(B.includes(e))return ue(e,t,n);if([`safety`,`nominations`,`save`].includes(e)&&n(`.ceremony-backdrop`,[[0,.45,`translateY(1%) scale(1.07)`],[e===`safety`?4200:e===`save`?4500:4800,.6,`translateY(-1%) scale(1.015)`]]),e===`safety`&&(n(t,[[0,0],[240,1],[3860,1],[4200,0]]),n(`.c-halo`,[[0,0,`scale(.8)`],[600,.85,`scale(1)`],[2500,1,`scale(1.1)`],[4200,.75,`scale(1.15)`]]),n(`.safety-arch`,[[0,0],[600,.65],[4200,.65]]),n(`.c-ground`,[[0,0],[600,1],[4200,1]]),n(`.safety-ordinary`,[[0,0,`translateY(18px) scale(.96)`],[550,1,`translateY(0) scale(1)`],[1550,1,`translateY(0) scale(1)`,`steps(1,end)`],[1680,0,`translateY(0) scale(1)`],[4200,0]]),n(`.safety-flying-shield`,[[0,0,`translateX(-150px) translateY(30px) rotate(-18deg) scale(.6)`],[700,0,`translateX(-150px) translateY(30px) rotate(-18deg) scale(.6)`],[1120,1,`translateX(4px) translateY(-3px) rotate(3deg) scale(1.04)`],[1350,1,`translateX(0) translateY(0) rotate(0) scale(1)`,`steps(1,end)`],[1680,0,`translateX(0) translateY(0) rotate(0) scale(1)`],[4200,0]]),n(`.c-wash`,[[0,0],[1530,0],[1630,1],[1740,1],[1960,0],[4200,0]]),n(`.safety-knight`,[[0,0,`translateY(0) scale(1.025)`,`steps(1,end)`],[1680,1,`translateY(0) scale(1.025)`],[2160,1,`translateY(0) scale(1)`],[3860,1,`translateY(0) scale(1.018)`],[4200,1,`translateY(0) scale(1.018)`]]),n(`.c-caption`,[[0,0,`translateY(10px)`],[1880,0,`translateY(10px)`],[2280,1,`translateY(0)`],[4200,1,`translateY(0)`]])),e===`nominations`&&(n(t,[[0,0],[250,1],[4430,1],[4800,0]]),n(`.nom-chasm`,[[0,0],[600,.9],[4800,1]]),n(`.nom-warning`,[[0,0],[350,1],[4800,1]]),n(`.nom-first`,[[0,0,`translateX(65px) translateY(20px) scale(1.12)`],[350,0,`translateX(65px) translateY(20px) scale(1.12)`],[900,1,`translateX(65px) translateY(0) scale(1.12)`],[1350,1,`translateX(65px) translateY(0) scale(1.12)`],[2050,1,`translateX(0) translateY(0) scale(1)`],[4800,1,`translateX(0) translateY(0) scale(1)`]]),n(`.nom-second`,[[0,0,`translateX(34px) translateY(18px) scale(.96)`],[1600,0,`translateX(34px) translateY(18px) scale(.96)`],[2280,1,`translateX(0) translateY(0) scale(1)`],[4800,1,`translateX(0) translateY(0) scale(1)`]]),n(`.nom-first .nom-aura`,[[0,0],[650,.9],[1150,.4],[2050,.7],[4800,.5]]),n(`.nom-second .nom-aura`,[[0,0],[1750,0],[2250,.9],[2850,.45],[4800,.5]]),n(`.c-caption`,[[0,0,`translateY(12px)`],[2450,0,`translateY(12px)`],[2900,1,`translateY(0)`],[4800,1,`translateY(0)`]])),e===`save`){n(t,[[0,0],[240,1],[4140,1],[4500,0]]),n(`.save-danger-halo`,[[0,0],[550,.85],[1510,.85],[1900,0],[4500,0]]),n(`.save-safe-halo`,[[0,0],[1670,0],[2150,1],[4500,.85]]),n(`.save-ground`,[[0,0],[1780,0],[2200,1],[4500,1]]),n(`.save-person`,[[0,0,`translateY(10px) scale(.98)`],[450,1,`translateY(0) scale(1)`],[1550,1,`translateY(0) scale(1)`],[2050,1,`translateY(-12px) scale(1.015)`],[2550,1,`translateY(-8px) scale(1)`],[4500,1,`translateY(-8px) scale(1.012)`]]),n(`.save-platform`,[[0,0],[450,1],[1570,1,`translateY(0)`],[2040,0,`translateY(65px)`],[4500,0,`translateY(65px)`]]),n(`.save-shield`,[[0,0,`translateX(-150px) translateY(20px) rotate(-15deg) scale(.3)`],[1e3,0,`translateX(-150px) translateY(20px) rotate(-15deg) scale(.3)`],[1590,1,`translateX(0) translateY(0) rotate(0) scale(1.06)`],[2030,.9,`translateX(0) translateY(0) rotate(0) scale(1)`],[4500,.9,`translateX(0) translateY(0) rotate(0) scale(1)`]]);for(let[e,t]of[[`.save-bracket-left`,-1],[`.save-bracket-right`,1]])n(e,[[0,0],[450,.9],[1570,.9,`translateX(0) rotate(0)`],[2020,0,`translateX(`+t*65+`px) rotate(`+t*14+`deg)`],[4500,0]]);n(`.c-wash`,[[0,0],[1530,0],[1640,.95],[1740,.95],[1940,0],[4500,0]]),n(`.save-danger-caption`,[[0,0],[600,1],[1560,1],[1700,0],[4500,0]]),n(`.save-safe-caption`,[[0,0,`translateY(10px)`],[1950,0,`translateY(10px)`],[2350,1,`translateY(0)`],[4500,1,`translateY(0)`]])}e===`exit`&&(n(t,[[0,0],[300,1],[5e3,1]]),n(`.exit-room-light`,[[0,0],[600,.7],[3300,.7],[4100,.15],[5e3,0]]),n(`.exit-door-front`,[[0,0],[450,1],[5e3,1]]),n(`.exit-near`,[[0,0,`translateX(-45px) translateY(20px) scale(1.02)`],[350,1,`translateX(-40px) translateY(16px) scale(1)`],[950,1,`translateX(-18px) translateY(8px) scale(.85)`],[2050,1,`translateX(20px) translateY(0) scale(.54)`,`steps(1,end)`],[2100,0,`translateX(20px) translateY(0) scale(.54)`],[5e3,0]]),n(`.exit-far`,[[0,0,`translateX(20px) translateY(0) scale(.54)`,`steps(1,end)`],[2100,1,`translateX(20px) translateY(0) scale(.54)`],[2780,1,`translateX(22px) translateY(-38px) scale(.36)`],[3260,0,`translateX(22px) translateY(-60px) scale(.25)`],[5e3,0]]),n(`.exit-leaf`,[[0,1,`rotateY(-88deg)`],[3210,1,`rotateY(-88deg)`],[3850,1,`rotateY(1deg)`],[4e3,1,`rotateY(0deg)`],[5e3,1,`rotateY(0deg)`]]),n(`.exit-sign`,[[0,0],[500,1],[3800,1],[4250,0],[5e3,0]]),n(`.c-caption`,[[0,0,`translateY(8px)`],[750,1,`translateY(0)`],[3480,1,`translateY(0)`],[3990,0,`translateY(0)`],[5e3,0]]),n(`.exit-blackout`,[[0,0],[3980,0],[4650,1],[5e3,1]])),e===`tiebreak`&&(n(t,[[0,0],[250,1],[3850,1],[4200,0]]),n(`.tie-halo`,[[0,0],[600,.8],[4200,.35]]),n(`.tie-scales`,[[0,0,`translateY(-35px) scale(.9)`],[850,1,`translateY(0) scale(1)`],[2050,1,`rotate(0deg)`],[2800,1,`rotate(8deg)`],[4200,1,`rotate(8deg)`]]),n(`.tie-candidate`,[[0,0,`translateY(24px) scale(.96)`],[700,1,`translateY(0) scale(1)`],[4200,1,`translateY(0) scale(1)`]]),n(`.tie-token`,[[0,0,`translateY(-75px) scale(.7) rotate(-12deg)`],[1450,0,`translateY(-75px) scale(.7) rotate(-12deg)`],[1930,1,`translateY(5px) scale(1.12) rotate(0)`],[2180,1,`translateY(0) scale(1) rotate(0)`],[4200,1,`translateY(0) scale(1) rotate(0)`]]),n(`.c-caption`,[[0,0,`translateY(10px)`],[2550,0,`translateY(10px)`],[2900,1,`translateY(0)`],[4200,1,`translateY(0)`]])),e===`ambush`&&(n(t,[[0,0],[280,1],[3950,1],[4300,0]]),n(`.ambush-side-nominees`,[[0,0],[650,.85],[4300,.45]]),n(`.ambush-curtain-left`,[[0,1,`translateX(0)`],[1650,1,`translateX(0)`],[2350,1,`translateX(-115px)`],[4300,1,`translateX(-115px)`]]),n(`.ambush-curtain-right`,[[0,1,`translateX(0)`],[1650,1,`translateX(0)`],[2350,1,`translateX(115px)`],[4300,1,`translateX(115px)`]]),n(`.ambush-beam`,[[0,0,`scaleY(.3)`],[1750,0,`scaleY(.3)`],[2450,.85,`scaleY(1)`],[4300,.65,`scaleY(1)`]]),n(`.ambush-platform`,[[0,0,`translateY(70px) scale(.8)`],[2200,0,`translateY(70px) scale(.8)`],[2580,1,`translateY(0) scale(1)`],[4300,1,`translateY(0) scale(1)`]]),n(`.ambush-target`,[[0,0,`translateY(35px) scale(.92)`],[2380,0,`translateY(35px) scale(.92)`],[2780,1,`translateY(0) scale(1)`],[4300,1,`translateY(0) scale(1)`]]),n(`.ambush-stamp`,[[0,0,`scale(1.35) rotate(-9deg)`],[2780,0,`scale(1.35) rotate(-9deg)`],[3200,1,`scale(1) rotate(-4deg)`],[4300,1,`scale(1) rotate(-4deg)`]]),n(`.c-caption`,[[0,0],[3100,0],[3500,1],[4300,1]])),e===`allPower`&&(n(t,[[0,0],[260,1],[3850,1],[4200,0]]),n(`.power-aura`,[[0,0,`scale(.75)`],[750,.8,`scale(1)`],[2500,1,`scale(1.1)`],[4200,.5,`scale(1.15)`]]),n(`.power-eye`,[[0,0,`scale(.65) rotate(-18deg)`],[500,0,`scale(.65) rotate(-18deg)`],[1230,.75,`scale(1) rotate(0)`],[4200,.65,`scale(1) rotate(0)`]]),n(`.power-king`,[[0,0,`translateY(40px) scale(.97)`],[900,1,`translateY(0) scale(1)`],[3300,1,`translateY(-4px) scale(1.015)`],[4200,1,`translateY(-4px) scale(1.015)`]]),n(`.power-shield`,[[0,0,`translateX(145px) rotate(16deg) scale(.7)`],[1300,0,`translateX(145px) rotate(16deg) scale(.7)`],[1950,1,`translateX(0) rotate(0) scale(1.05)`],[2250,1,`translateX(0) rotate(0) scale(1)`],[4200,1,`translateX(0) rotate(0) scale(1)`]]),n(`.power-label`,[[0,0,`translateY(12px)`],[2100,0,`translateY(12px)`],[2500,1,`translateY(0)`],[4200,1,`translateY(0)`]]),n(`.c-caption`,[[0,0],[2800,0],[3200,1],[4200,1]])),e===`shock`&&(n(t,[[0,0],[120,1],[3150,1],[3400,0]]),n(`.shock-curtain-left`,[[0,1,`translateX(0)`],[740,1,`translateX(0)`],[1190,1,`translateX(-115px)`],[3400,1,`translateX(-115px)`]]),n(`.shock-curtain-right`,[[0,1,`translateX(0)`],[740,1,`translateX(0)`],[1190,1,`translateX(115px)`],[3400,1,`translateX(115px)`]]),n(`.shock-rays`,[[0,0,`scale(.65)`],[950,.25,`scale(.75)`],[1450,.85,`scale(1)`],[3400,.3,`scale(1.08)`]]),n(`.shock-eye`,[[0,0,`scale(.62) rotate(-8deg)`],[1050,0,`scale(.62) rotate(-8deg)`],[1500,1,`scale(1.04) rotate(0)`],[3400,.9,`scale(1) rotate(0)`]]),n(`.shock-card`,[[0,0,`translateY(22px) scale(.96)`],[1500,0,`translateY(22px) scale(.96)`],[1900,1,`translateY(0) scale(1)`],[3400,1,`translateY(0) scale(1)`]]),n(`.c-caption`,[[0,0],[2350,0],[2750,1],[3400,1]])),e===`final4`&&(n(t,[[0,0],[250,1],[4050,1],[4400,0]]),n(`.f4-arch`,[[0,0,`scale(.85)`],[600,.7,`scale(1)`],[4400,.7,`scale(1)`]]),n(`.f4-player`,[[0,0,`translateY(30px) scale(.94)`],[750,1,`translateY(0) scale(1)`],[4400,1,`translateY(0) scale(1)`]]),n(`.f4-ballot`,[[0,0,`translateY(-80px) rotate(-12deg) scale(.7)`],[1450,0,`translateY(-80px) rotate(-12deg) scale(.7)`],[1950,1,`translateY(2px) rotate(0) scale(1.08)`],[2180,1,`translateY(0) rotate(0) scale(1)`],[4400,1,`translateY(0) rotate(0) scale(1)`]]),n(`.f4-three`,[[0,1,`scale(1)`],[2350,1,`scale(1)`],[2850,.22,`scale(.9)`],[4400,.22,`scale(.9)`]]),n(`.c-caption`,[[0,0],[3100,0],[3500,1],[4400,1]])),e===`final3`&&(n(t,[[0,0],[250,1],[4700,1],[5e3,0]]),n(`.f3-arch`,[[0,0,`scale(.9)`],[650,.75,`scale(1)`],[5e3,.75,`scale(1)`]]),n(`.f3-player`,[[0,0,`translateY(24px) scale(.96)`],[750,1,`translateY(0) scale(1)`],[5e3,1,`translateY(0) scale(1)`]]),n(`.f3-crown`,[[0,0,`translateY(-22px) scale(.8)`],[850,0,`translateY(-22px) scale(.8)`],[1250,1,`translateY(0) scale(1)`],[5e3,1,`translateY(0) scale(1)`]]),n(`.f3-decree`,[[0,0,`scale(.8) rotate(8deg)`],[1900,0,`scale(.8) rotate(8deg)`],[2420,1,`scale(1) rotate(0)`],[5e3,1,`scale(1) rotate(0)`]]),n(`.f3-right`,[[0,1,`translateX(0) scale(1)`],[2720,1,`translateX(0) scale(1)`],[3300,0,`translateX(110px) scale(.8)`],[5e3,0,`translateX(110px) scale(.8)`]]),n(`.f3-door`,[[0,0,`translateX(65px) scale(.85)`],[2900,0,`translateX(65px) scale(.85)`],[3450,1,`translateX(0) scale(1)`],[5e3,1,`translateX(0) scale(1)`]]),n(`.c-caption`,[[0,0],[3650,0],[4050,1],[5e3,1]]),n(`.f3-blackout`,[[0,0],[3150,0],[3700,.94],[3900,.55],[5e3,.55]]))}var K={"crown.webp":{bytes:3866,width:144,height:44,sha256:`093c809ae1701b890f388ccd58a1f92676183cc81cf43a8923ab2d1565b301c5`,mode:`reused-approved-prototype-artwork`},"shield.webp":{bytes:15036,width:240,height:300,sha256:`e757ad580a9b0731aec01810ab06fbf4fc34464cb52213c2a696bb0b96a567d3`,mode:`reused-approved-prototype-artwork`},"throne.webp":{bytes:94524,width:600,height:900,sha256:`8795123c51db09abf84256bea26f57b34e14f3e7d13c9c9f71bf4725d99ae2b6`,mode:`reused-approved-prototype-artwork`},"hub-chamber.webp":{bytes:93882,width:720,height:1080,sha256:`9e6d37a838ef660693fd9bf03f32d534933f674d617aa841f232b921ead41b5e`,mode:`reused-approved-prototype-artwork`},"royal-room.webp":{bytes:93730,width:720,height:1080,sha256:`8658168aae0912595fa85113996ed646479e0f89be0e516684520d99f57cf066`,mode:`reused-approved-prototype-artwork`},"door-leaf.webp":{bytes:5396,width:95,height:480,sha256:`d44eb5d5df49d3cd8f81b223e4123a46a00a669f5599d7f99e417c7028fa1457`,mode:`reused-approved-prototype-artwork`},"sanctuary.webp":{bytes:31070,width:480,height:720,sha256:`6fd02da940f25b3d596376ed664f57ef994a7a10bfcedf60aabb324d9aac9849`,mode:`reused-approved-prototype-artwork`},"danger-chamber.webp":{bytes:18322,width:480,height:720,sha256:`1deb5dc0218ee3d2b7d1d741b229bdb7ccbf7e51efa70d43a86c8a942c797b20`,mode:`reused-approved-prototype-artwork`},"power-console.webp":{bytes:147344,width:640,height:960,sha256:`00af78424c331cb8ea36aa5de82aad628970819956c047fc753ac66a6a91927b`,mode:`reused-approved-prototype-artwork`},"shock-chamber.webp":{bytes:99502,width:720,height:1080,sha256:`3b7fe123c8d35dd8497ddf98bcdb7ebbc1b605a66055346d73930df87363385e`,mode:`reused-approved-prototype-artwork`},"atmosphere.webp":{bytes:25952,width:360,height:540,sha256:`83debd9b9b0cc7de29f129d4cd3b8fd1e67cdf410ff0861c8d315cc89513dd09`,mode:`reused-approved-prototype-artwork`},"decision-token.webp":{bytes:6074,width:192,height:128,sha256:`5a6c713b089b34f1eb9f645051040ec532f260f49cc839f62743eb8078d91221`,mode:`reused-approved-prototype-artwork`},"hub-city.webp":{bytes:213462,width:600,height:1297,sha256:`5ca6210500803030c88e7d4261e1a91186ad87b953c3200fe559302503d41c4b`,mode:`reused-approved-prototype-artwork`},"safety-shield-reveal.webp":{bytes:26190,width:256,height:320,sha256:`7bff8a67066074378de92e03b44b139748e1d81c4b66630e30ac281ee0481fa5`,mode:`reused-approved-prototype-artwork`},"danger-platform.webp":{bytes:15378,width:400,height:220,sha256:`016e5ce194331f650dbb8bf09e49035da2a217eb203bbe1c6017a6c6dfee04d8`,mode:`reused-approved-prototype-artwork`},"exit-doorframe.webp":{bytes:32250,width:480,height:720,sha256:`1397f69abfa2b87bf6e73ea02044489b531d040aa3902d90f0d284a474734740`,mode:`reused-approved-prototype-artwork`},"tiebreak-scales.webp":{bytes:23732,width:384,height:288,sha256:`2de6e9e7c9b3aa7b5f88319bb2246b51ba4b74d34fb146e8c1a77e5fc0b9fcf8`,mode:`reused-approved-prototype-artwork`},"shock-eye-seal.webp":{bytes:24188,width:384,height:288,sha256:`b98bc2be9dc68046e07180b62426b9eaded8ae0639a901cd1d710686e42782bd`,mode:`reused-approved-prototype-artwork`},"curtain.webp":{bytes:28114,width:176,height:592,sha256:`f6edf2c08ec15c15d621c4bfb494c1df61c9d01c0399dde68fcd0c9bebe98074`,mode:`reused-approved-prototype-artwork`},"vox-studio.webp":{width:720,height:1080,bytes:45186}},pe={src:`assets/ceremonies/vfx/announcement-atmosphere-v1.webp`,width:960,height:320,bytes:85548},q={shockMist:{src:`assets/ceremonies/vfx/natural-mist-v2.webp`,width:960,height:320,bytes:70978},shockHeart:{src:`assets/ceremonies/vfx/rose-glass-heart-v1.webp`,width:256,height:256,bytes:13992},shockHalo:{src:`assets/ceremonies/vfx/champagne-halo-v1.webp`,width:384,height:192,bytes:15012},shockDna:{src:`assets/ceremonies/vfx/amethyst-dna-v1.webp`,width:192,height:384,bytes:24944},shockBallot:{src:`assets/ceremonies/vfx/obsidian-ballot-box-v1.webp`,width:256,height:256,bytes:10990},shockAntidote:{src:`assets/ceremonies/vfx/jade-antidote-v1.webp`,width:256,height:384,bytes:18230},shockForce:{src:`assets/ceremonies/vfx/pressure-wave-v1.webp`,width:512,height:512,bytes:99334}},me={cupidLoh:{label:`Cupid · shared LOH`,duration:4400},cupidPower:{label:`Cupid · all the power`,duration:4400},cupidSafety:{label:`Cupid · shared Safety`,duration:4200},cupidNominations:{label:`Cupid · nominated pairs`,duration:4800},cupidSave:{label:`Cupid · pair saved`,duration:4500},cupidExit:{label:`Cupid · paired departure`,duration:10200},cupidAmbush:{label:`Cupid · pair ambush`,duration:4800},voxImmunity:{label:`Vox · immunity`,duration:4200},voxFinal4:{label:`Vox · Final 4 competition`,duration:4400},voxNominations:{label:`Vox · secret nominations`,duration:4800},voxResults:{label:`Vox · public verdict`,duration:1e4}};function he(e,t,n,r){let i=e=>({src:`assets/ceremonies/shared/`+e+`.webp`,...n[e+`.webp`]}),a=(e,n)=>({...t[e].poses[n],character:t[e].id,pose:n}),o={};if(e.startsWith(`cupid`)){if([`cupidLoh`,`cupidPower`].includes(e)&&(o.pairWinner=a(`b`,`front`),o.pairRoyal=a(`b`,`royal-standing`),o.pairSeated=a(`b`,`royal-seated`),e===`cupidPower`&&(o.pairShield=i(`shield`))),e===`cupidSafety`&&(o.pairWinner=a(`b`,`front`),o.pairKnight=a(`b`,`safety-knight`)),e===`cupidSave`&&(o.pairWinner=a(`b`,`front`)),e===`cupidExit`&&(o.pairExit=a(`b`,`exit-back`)),e===`cupidNominations`)for(let[e,n]of Object.entries(t))n.playerId&&(o[`pairFront_`+e]=a(e,`front`));e!==`cupidExit`&&(o.pairHeart=r.shockHeart)}if([`voxResults`,`voxFinal4`].includes(e)){o.voxStudio=i(`vox-studio`),o.voxMist=r.shockMist;for(let[e,n]of Object.entries(t))n.playerId&&(o[`voxActor_`+e]=a(e,`front`));e===`voxFinal4`&&(o.voxToken=i(`decision-token`))}return o}var J=(e,t,n)=>{let r=e[t].cloneNode();return r.className=n,r.alt=``,r},Y=(e,t,n)=>{let r=e.querySelector(t);r&&(r.textContent=n)};function X(e,t,n,r){let i=e.querySelector(t);i.replaceWith(J(n,r,i.className))}function ge(e,t,n,r,i,a,o){t.dataset.modeScene=e;let s=a.names??[],c=s.join(` & `);if(e===`voxNominations`&&(Y(t,`.nom-warning`,`SECRET HOUSEMATE BALLOTS · COUNTED`),Y(t,`.c-caption span`,`VOX POPULI · NOMINATIONS`),Y(t,`.c-caption strong`,`The Hub has nominated.`),Y(t,`.c-caption em`,`THE PUBLIC WILL VOTE TO ELIMINATE.`)),e===`voxImmunity`&&(Y(t,`.c-caption span`,`VOX POPULI · IMMUNITY`),Y(t,`.c-caption strong`,i.a.name),Y(t,`.c-caption em`,`PROTECTED FROM NOMINATION THIS ROUND.`)),e.startsWith(`cupid`)){if(t.classList.add(`paired-film`),[`cupidLoh`,`cupidPower`].includes(e)){let i=t.querySelector(`.loh-figure`),a=t.querySelector(`.loh-seated`);i.classList.add(`pair-first`),a.classList.add(`pair-first`);let s=i.cloneNode(!0),l=a.cloneNode(!0);s.classList.replace(`pair-first`,`pair-second`),l.classList.replace(`pair-first`,`pair-second`),X(s,`.loh-before .loh-person`,n,`pairWinner`),X(s,`.loh-royal .loh-person`,n,`pairRoyal`),X(l,`.loh-seated-image`,n,`pairSeated`),o(s.querySelector(`.loh-before .loh-crown`),r.pairWinner),o(s.querySelector(`.loh-royal .loh-crown`),r.pairRoyal),o(l.querySelector(`.loh-seated-crown`),r.pairSeated);let u=r.pairSeated.throne;l.querySelector(`.loh-seat-throne`).style.transform=`translate(${u.x*100}%,${u.y*100}%) scale(${u.scale})`,t.append(s,l),Y(t,`.loh-kicker`,e===`cupidPower`?`ONE PAIR. ALL THE POWER.`:`CUPID’S ARROW · SHARED LOH`),Y(t,`.loh-name`,c),Y(t,`.loh-title`,`TWO CROWNS. ONE REIGN.`),e===`cupidPower`&&t.append(J(n,`pairShield`,`pair-power-shield`))}if(e===`cupidSafety`){for(let[e,r]of[[`.safety-ordinary`,`pairWinner`],[`.safety-knight`,`pairKnight`]]){t.querySelector(e).classList.add(`pair-first`);let i=J(n,r,t.querySelector(e).className.replace(`pair-first`,`pair-second`));t.append(i)}Y(t,`.c-caption span`,`CUPID’S ARROW · SHARED SAFETY`),Y(t,`.c-caption strong`,c),Y(t,`.c-caption em`,`ONE PAIR. ONE POWER OF SAFETY.`)}if(e===`cupidSave`){let e=t.querySelector(`.save-person`);e.classList.add(`pair-first`),t.append(J(n,`pairWinner`,e.className.replace(`pair-first`,`pair-second`))),Y(t,`.save-danger-caption strong`,`One pair on the block.`),Y(t,`.save-safe-caption strong`,c),Y(t,`.save-safe-caption em`,`BOTH SAVED. BOTH OFF THE BLOCK.`)}if(e===`cupidNominations`){let e=Object.keys(n).filter(e=>e.startsWith(`pairFront_`)),r=Array.from({length:e.length/2},(t,n)=>e.slice(n*2,n*2+2));if(r.length===3&&!t.querySelector(`.nom-third`)){let e=t.querySelector(`.nom-second`).cloneNode(!0);e.classList.replace(`nom-second`,`nom-third`),t.append(e),t.classList.add(`nom-three`)}for(let[e,i]of r.entries()){let r=t.querySelector([`.nom-first`,`.nom-second`,`.nom-third`][e]);X(r,`.nom-person`,n,i[0]),r.querySelector(`.nom-person`).classList.add(`pair-first`),r.append(J(n,i[1],`nom-person pair-second`)),Y(r,`.nom-label`,s.slice(e*2,e*2+2).join(` & `))}Y(t,`.nom-warning`,`CUPID’S ARROW · NOMINATED PAIRS`),Y(t,`.c-caption strong`,`Linked by love. Facing danger.`),Y(t,`.c-caption em`,`THE PAIRS FACE ELIMINATION TOGETHER.`)}if(e===`cupidExit`){for(let e of t.querySelectorAll(`.cine-departure`))e.querySelector(`.cine-rear`).classList.add(`pair-first`),e.append(J(n,`pairExit`,`cine-rear pair-second`));Y(t,`.exit-caption span`,c),Y(t,`.exit-caption h3`,`Bound together. Leaving together.`);return}t.append(J(n,`pairHeart`,`pair-link-heart`))}}function _e(e,t,n,r){let i=e===`voxResults`,a=document.createElement(`div`);a.className=`c-scene vox-broadcast`,a.dataset.modeScene=e,a.setAttribute(`aria-hidden`,`true`),a.innerHTML=`<div class="vox-camera"><div class="vox-set"></div><div class="vox-haze"></div><div class="vox-light"></div><div class="vox-room-dim"></div><div class="vox-danger-tint"></div><div class="vox-contestants"></div></div><div class="vox-cut"></div><div class="vox-reveal-sweep"></div>`+(i?``:`<div class="vox-heading"><span>VOX POPULI · FINAL FOUR</span><h2>Competition won.</h2><p>NO IMMUNITY IS AWARDED.</p></div><div class="vox-verdict"><span>THE FINAL FOUR CONTINUE</span><h3></h3><p>The audience still decides who leaves.</p></div>`),a.querySelector(`.vox-set`).append(J(t,`voxStudio`,`vox-backdrop`)),a.querySelector(`.vox-haze`).append(J(t,`voxMist`,`vox-smoke`));let o=i?r.tallies:[{id:n.a.playerId,name:n.a.name}],s=a.querySelector(`.vox-contestants`);s.style.setProperty(`--contestants`,o.length);for(let[e,n]of o.entries()){let a=document.createElement(`div`);a.className=`vox-contestant`,a.dataset.playerId=n.id;let o=J(t,`voxActor_`+String.fromCharCode(97+e),`vox-person`),c=document.createElement(`div`);c.className=`vox-identity`;let l=document.createElement(`strong`);l.textContent=n.name;let u=document.createElement(`span`);if(u.className=i?`vox-count vox-percent`:`vox-count`,u.textContent=i?`0.0%`:`COMPETITION WINNER`,i&&(u.dataset.finalValue=String(Number(n.value))),c.append(l),i){let e=document.createElement(`div`);e.className=`vox-percent-shell`,e.innerHTML=`<i class="vox-percent-tone"></i><i class="vox-score-sheen"></i><i class="vox-number-bloom"></i>`,e.append(u),c.append(e);let t=document.createElement(`div`);t.className=`vox-floor-pool`;let n=document.createElement(`div`);n.className=`vox-focus-light`,a.append(t,n)}else c.append(u);a.append(o,c),i&&r.kind!==`tie`&&a.classList.add(r.ids.includes(n.id)?`vox-departing`:`vox-safe`),s.append(a)}if(i&&[`public-tie`,`tie`].includes(r.kind)){let e=document.createElement(`div`);e.className=`vox-tie-note`,e.textContent=r.kind===`public-tie`?`TIED VOTE · APPROVAL TIEBREAK · `+r.approval.map(e=>`${e.name}: ${Number(e.value).toFixed(1)}`).join(` · `):`THE VOTE IS TIED · TIEBREAK FOLLOWS`,a.append(e)}return i||(Y(a,`.vox-verdict h3`,n.a.name),a.querySelector(`.vox-camera`).append(J(t,`voxToken`,`vox-token`))),a}function ve(e,t,n,r,i){let a=e===`voxResults`,o=[...t.querySelectorAll(`.vox-contestant`)],s=o.filter(e=>e.classList.contains(`vox-departing`)),c=t.querySelector(`.vox-contestants`),l=o.filter(e=>!e.classList.contains(`vox-safe`)).length,u=`cubic-bezier(.22,.72,.22,1)`,d=`cubic-bezier(.16,1,.3,1)`;n(t,[[0,0],[180,1],[r-250,1],[r,0]]),n(`.vox-camera`,a?[[0,1,`scale(1.1) translateY(1%)`,d],[1500,1,`scale(1) translateY(0)`],[5e3,1,`scale(1.015) translateY(0)`,u],[6100,1,`scale(1.055) translateY(-.5%)`,d],[6700,1,`scale(1.025) translateY(0)`,u],[r,1,`scale(1.075) translateY(-.8%)`]]:[[0,1,`scale(1.12) translateY(1%)`],[1400,1,`scale(1.03) translateY(0)`],[r,1,`scale(1.065) translateY(-1%)`]]),n(`.vox-haze`,[[0,.22,`translateX(-8%) scale(1.1)`],[r,.28,`translateX(7%) scale(1.15)`]]);for(let[e,t]of o.entries()){let i=t.classList.contains(`vox-safe`),f=s.indexOf(t),p=`translateX(${f>=0?c.clientWidth*((f+.5)/Math.max(1,l))-(t.offsetLeft+t.offsetWidth/2):0}px) scale(1.035)`;n(t,[[0,0,`translateY(22px)`,d],[350+e*150,0,`translateY(22px)`,d],[1100+e*150,1,`translateY(0)`],...a&&i?[[6400,1,`translateX(0)`,u],[7150,0,`translateX(${e<o.length/2?-32:32}px) scale(.97)`],[r,0]]:a&&f>=0?[[6800,1,`translateX(0) scale(1)`,u],[8e3,1,p],[r,1,p]]:[[r,1]]]);let m=t.querySelector(`.vox-count`);a?(n(t.querySelector(`.vox-percent-shell`),[[0,0,`translateY(16px) scaleX(.82)`],[1400,0,`translateY(16px) scaleX(.82)`,d],[2050,1,`translateY(0) scaleX(1)`],[r,1]]),n(t.querySelector(`.vox-score-sheen`),[[0,0,`translateX(-170%) skewX(-18deg)`],[4250,0,`translateX(-170%) skewX(-18deg)`],[4470,.8,`translateX(-20%) skewX(-18deg)`,d],[4950,0,`translateX(210%) skewX(-18deg)`],[r,0]]),n(t.querySelector(`.vox-number-bloom`),[[0,0],[4380,0],[4550,.28],[5100,0],[r,0]]),n(t.querySelector(`.vox-floor-pool`),[[0,0],[1200,.35],[5200,.35],[5900,.12],[r,.12]]),f>=0&&(n(t.querySelector(`.vox-focus-light`),[[0,0],[6200,0],[6750,.8],[r,.65]]),n(t.querySelector(`.vox-percent-tone`),[[0,0],[6400,0],[7350,.72],[r,.72]]))):n(m,[[0,0],[1100,0],[1600,1],[r,1]])}if(a){let e=o.map(e=>e.querySelector(`.vox-count`)),a=t=>{let n=t/50,r=n*n*(3-2*n);for(let t of e)t.textContent=`${(Number(t.dataset.finalValue)*r).toFixed(1)}%`;t<50&&i(()=>a(t+1),40)};i(()=>a(0),2400),s.length&&(n(`.vox-room-dim`,[[0,0],[5100,0],[5900,.74],[6450,.74],[7600,.38],[r,.38]]),n(`.vox-danger-tint`,[[0,0],[6500,0],[7800,.65],[r,.65]]),n(`.vox-reveal-sweep`,[[0,0,`translateX(-115%)`],[6150,0,`translateX(-115%)`],[6450,.7,`translateX(-35%)`,d],[7100,0,`translateX(100%)`],[r,0]])),t.querySelector(`.vox-tie-note`)&&n(`.vox-tie-note`,[[0,0],[5900,0],[6500,1],[r,1]])}else n(`.vox-heading`,[[0,0,`translateY(-12px)`],[450,1,`translateY(0)`],[r,1]]),n(`.vox-verdict`,[[0,0,`translateY(18px)`],[1900,0,`translateY(18px)`],[2450,1,`translateY(0)`],[r,1]]);n(`.vox-cut`,[[0,0],[a?6150:1700,0],[a?6420:1900,a?.22:.45],[a?6900:2200,0],[r,0]])}function ye(t,n,r,i){n.querySelector(`.pair-link-heart`)&&r(`.pair-link-heart`,[[0,0,`scale(.85)`],[1100,0,`scale(.85)`],[1900,.7,`scale(1)`],[i,.55,`scale(1.04)`]]),t===`cupidPower`&&r(`.pair-power-shield`,[[0,0],[2400,0],[2900,1],[i,1]]),e(t)===`nominations`&&n.querySelector(`.nom-third`)&&(r(`.nom-third`,[[0,0,`translateY(18px)`],[2700,0,`translateY(18px)`],[3280,1,`translateY(0)`],[i,1]]),r(`.nom-third .nom-aura`,[[0,0],[2950,0],[3370,.8],[i,.5]]))}var be=`/* Reusable actors stay independent from the sets. Only transform and opacity animate. */

.paired-film .pair-link-heart {
  position: absolute;
  width: 9%;
  height: 6%;
  object-fit: contain;
  left: 45.5%;
  top: 20%;
  z-index: 4;
  opacity: 0;
}
.paired-film.fitted-loh .loh-figure,
.paired-film.fitted-loh .loh-seated {
  width: 49%;
  bottom: 22%;
  z-index: 2;
  margin: 0;
}
.paired-film.fitted-loh .pair-first {
  left: 2%;
}
.paired-film.fitted-loh .pair-second {
  left: 49%;
}
.paired-film .loh-name {
  font-size: clamp(20px, 5.3vw, 38px);
  line-height: 1.08;
}
.paired-film .loh-titles {
  bottom: 8%;
}
.paired-film .pair-power-shield {
  position: absolute;
  width: 17%;
  height: 20%;
  object-fit: contain;
  left: 41.5%;
  top: 48%;
  z-index: 4;
}
.paired-film.c-safety .c-hero,
.paired-film.c-save .c-hero {
  width: 49%;
  height: 54%;
  bottom: 25%;
  object-fit: contain;
}
.paired-film.c-safety .pair-first,
.paired-film.c-save .pair-first {
  left: 3%;
}
.paired-film.c-safety .pair-second,
.paired-film.c-save .pair-second {
  left: 48%;
}
.paired-film .fitted-knight-shield {
  left: 44%;
  top: 43%;
  width: 12%;
  height: 15%;
}
.paired-film .safety-flying-shield {
  left: 43%;
  width: 14%;
}
.paired-film .save-shield {
  left: 39%;
  width: 22%;
}
.paired-film .save-platform {
  left: 6%;
  width: 88%;
}
.paired-film .c-caption strong {
  font-size: clamp(21px, 5.7vw, 42px);
  line-height: 1.08;
}
.paired-film .nom-pod {
  width: 48%;
}
.paired-film .nom-person {
  width: 72%;
  height: 86%;
  bottom: 25%;
}
.paired-film .nom-person.pair-first {
  left: -9%;
}
.paired-film .nom-person.pair-second {
  left: 37%;
}
.paired-film .nom-platform {
  width: 110%;
  left: -5%;
}
.paired-film .nom-label {
  font-size: clamp(8px, 2.1vw, 14px);
  letter-spacing: 0.03em;
  text-align: center;
  white-space: normal;
}
.paired-film.decision-film .cine-departure {
  width: 68%;
  left: 16%;
  aspect-ratio: 1.39;
}
.paired-film.decision-film .cine-rear {
  position: absolute;
  width: 48%;
  height: 100%;
  bottom: 0;
  object-fit: contain;
}
.paired-film.decision-film .cine-rear.pair-first {
  left: 11%;
}
.paired-film.decision-film .cine-rear.pair-second {
  left: 41%;
}
.paired-film.decision-film .departure-near {
  z-index: 7;
}
.paired-film .exit-caption h3 {
  font-size: clamp(20px, 5vw, 36px);
}
.vox-broadcast {
  color: #f5efdf;
  font-family: Georgia, serif;
  overflow: hidden;
  background: #09060f;
}
.vox-camera,
.vox-set,
.vox-light,
.vox-cut {
  position: absolute;
  inset: 0;
}
.vox-camera {
  transform-origin: 50% 55%;
}
.vox-backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.vox-haze {
  position: absolute;
  left: -15%;
  width: 130%;
  height: 35%;
  bottom: 15%;
  opacity: 0.25;
  pointer-events: none;
}
.vox-smoke {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.vox-light {
  background: linear-gradient(#05020c88, transparent 34%, #05020c66 70%, #05020c);
}
.vox-danger-tint {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 48%, #a51d2b24, #3a0712a8 78%);
}
.vox-heading {
  position: absolute;
  top: 7%;
  left: 7%;
  right: 7%;
  text-align: center;
}
.vox-heading span,
.vox-verdict span {
  font:
    9px/1.5 system-ui,
    sans-serif;
  letter-spacing: 0.2em;
  color: #dcc585;
}
.vox-heading h2 {
  font-size: clamp(25px, 6vw, 44px);
  font-weight: 400;
  margin: 10px 0;
}
.vox-heading p,
.vox-verdict p {
  font:
    10px/1.7 system-ui,
    sans-serif;
  color: #d1c4dc;
  letter-spacing: 0.06em;
}
.vox-contestants {
  position: absolute;
  left: 4%;
  right: 4%;
  bottom: 27%;
  z-index: 2;
  height: 51%;
  display: grid;
  grid-template-columns: repeat(var(--contestants), minmax(0, 1fr));
  align-items: end;
}
.vox-contestant {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  text-align: center;
  min-width: 0;
}
.vox-person {
  position: absolute;
  bottom: 17%;
  height: 85%;
  width: 155%;
  max-width: none;
  object-fit: contain;
  object-position: 50% 100%;
}
.vox-contestant strong {
  font-size: clamp(15px, 3.7vw, 27px);
  font-weight: 400;
  line-height: 1.1;
  z-index: 1;
  overflow-wrap: anywhere;
}
.vox-count {
  font:
    600 clamp(19px, 5vw, 35px)/1.8 system-ui,
    sans-serif;
  color: #e4cc91;
  z-index: 1;
}
.vox-verdict {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 7%;
  text-align: center;
}
.vox-identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  position: relative;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-contestants {
  bottom: 12%;
  height: 75%;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-person {
  bottom: 16%;
  height: 84%;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-identity {
  position: absolute;
  bottom: 0;
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-identity strong {
  max-width: 94%;
  font-size: clamp(18px, 4.5vw, 29px);
  text-shadow: 0 2px 10px #000c;
}
.vox-percent-shell {
  position: relative;
  width: min(86%, 160px);
  min-width: 72px;
  padding: 1px;
  overflow: hidden;
  isolation: isolate;
  clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px);
  background: linear-gradient(125deg, #efd69fa8, #89709640 30%, #5c3d7040 64%, #ddbc8190);
}
.vox-percent-shell::before {
  content: '';
  position: absolute;
  inset: 1px;
  z-index: 0;
  clip-path: inherit;
  background: linear-gradient(115deg, #100b1a, #35243c 48%, #170d20);
}
.vox-percent {
  display: block;
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  width: 100%;
  padding: 12px 7px 13px;
  color: #f4e0b2;
  font:
    500 clamp(23px, 5.8vw, 37px)/1.05 system-ui,
    sans-serif;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.035em;
  text-align: center;
  text-shadow: 0 1px 7px #cfac6638;
}
.vox-percent-tone,
.vox-number-bloom {
  position: absolute;
  inset: 1px;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
}
.vox-percent-tone {
  background: linear-gradient(120deg, #592a3baa, #6f1826bd, #341a32b0);
}
.vox-number-bloom {
  background: radial-gradient(ellipse at 50% 60%, #eed6a2bb, #ba8c7144 55%, transparent 80%);
}
.vox-score-sheen {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 10%;
  width: 55%;
  z-index: 1;
  opacity: 0;
  background: linear-gradient(
    90deg,
    transparent,
    #f5dfb70d 25%,
    #f6e5bb60 50%,
    #bc92cc15 70%,
    transparent
  );
}
.vox-floor-pool {
  position: absolute;
  left: 0;
  bottom: 15%;
  width: 100%;
  height: 4%;
  opacity: 0;
  background: radial-gradient(ellipse, #e1bd773d, #946ca225 42%, transparent 72%);
}
.vox-focus-light {
  position: absolute;
  left: -12%;
  bottom: 16%;
  width: 124%;
  height: 83%;
  opacity: 0;
  background: radial-gradient(ellipse at 50% 65%, #e5bd6824, #b78bc115 40%, transparent 70%);
}
.vox-room-dim {
  position: absolute;
  inset: 0;
  z-index: 1;
  opacity: 0;
  background: linear-gradient(#030107a6, #07040aa6 65%, #050209);
}
.vox-reveal-sweep {
  position: absolute;
  inset: -10% -30%;
  z-index: 4;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(
    110deg,
    transparent 30%,
    #8f6ab20a 40%,
    #d8b68538 49%,
    #dec59958 50%,
    #ae80ba12 56%,
    transparent 68%
  );
}
.vox-broadcast[data-mode-scene='voxResults'] .vox-danger-tint {
  background: linear-gradient(#61142626, #7212225c);
}
.vox-tie-note {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 4%;
  color: #ddc795;
  font:
    600 9px/1.5 system-ui,
    sans-serif;
  letter-spacing: 0.12em;
  text-align: center;
}
.vox-verdict h3 {
  font-size: clamp(28px, 7vw, 49px);
  font-weight: 400;
  margin: 9px 0;
  line-height: 1.08;
}
.vox-cut {
  background: radial-gradient(ellipse at 50% 55%, #a380ba88, #d2b27822 35%, transparent 70%);
  pointer-events: none;
}
.vox-token {
  position: absolute;
  width: 13%;
  height: 14%;
  object-fit: contain;
  bottom: 22%;
  left: 43.5%;
}
.vox-broadcast[data-mode-scene='voxFinal4'] .vox-person {
  width: 100%;
}
.vox-broadcast[data-mode-scene='voxFinal4'] .vox-count {
  display: none;
}
.vox-broadcast[data-mode-scene='voxFinal4'] .vox-contestant strong {
  display: none;
}
`,Z={loh:{label:`LOH crowning`,duration:4400},...V,...me},xe=Object.keys(Z),Se={shield:`safety-shield-reveal`,platform:`danger-platform`,curtain:`curtain`,crown:`crown`,throne:`throne`,cinema_hall:`hub-chamber`,cinema_portal:`door-leaf`,cinema_crown:`crown`,cinema_throne:`throne`,cinema_atmosphere:`atmosphere`,cinema_royalRoom:`royal-room`,cinema_city:`hub-city`,cinema_shield:`shield`,cinema_sanctuary:`sanctuary`,cinema_danger:`danger-chamber`,cinema_shockRoom:`shock-chamber`,cinema_console:`power-console`,cinema_token:`decision-token`},Ce,Q=e=>(e*100).toFixed(4)+`%`;function we(t,n,r=`doubleEviction`){let i=t,a=he(i,n,K,q);if(t=e(t),!t)return a;i===`cupidNominations`&&(n={a:n.a,b:n.c,c:n.e??n.a});let o=(e,t)=>({...n[e].poses[t],character:n[e].id,pose:t}),s={male:o(`a`,`front`),female:o(t===`save`?`a`:`b`,`front`),knight:o(`a`,`safety-knight`),cinema_standA:o(`a`,`front`),cinema_standB:o(`b`,`front`),cinema_standC:o(`c`,`front`),cinema_decisionA:o(`a`,`decision-back`),cinema_decisionB:o(`b`,`decision-back`),cinema_exitC:o(`c`,`exit-back`),cinema_seatedA:o(`a`,`royal-seated`),winner:o(`a`,`front`),royal:o(`a`,`royal-standing`),seated:o(`a`,`royal-seated`)},l=t===`loh`?[`winner`,`royal`,`seated`,`throne`,`crown`,`curtain`,`cinema_royalRoom`]:Z[t].art.filter(e=>![`cinema_avatarC`,`cinema_eliminatedStamp`].includes(e));t===`shock`&&l.push(`shockAtmosphere`,`shockMist`,...c(r)),t===`nominations`&&new Set([n.a,n.b,n.c].map(e=>e.playerId??e.id)).size===3&&l.push(`cinema_standC`);let u=l.filter(e=>!(N[t]&&e===(t===`final4`?`cinema_decisionA`:`cinema_decisionB`)));return{...Object.fromEntries(u.map(e=>{if(q[e])return[e,q[e]];if(e===`shockAtmosphere`)return[e,pe];if(s[e])return[e,s[e]];let t=Se[e]+`.webp`,n=K[t];if(!n)throw Error(`No reusable resource for `+e);return[e,{src:`assets/ceremonies/shared/`+t,...n}]})),...a}}function $(e,t){let{x:n,baseY:r,width:i,angle:a}=t.crown;e.style.cssText=`position:absolute;left:${Q(n-i/2)};top:${Q(r-i*t.width/t.height*44/144*.88)};width:${Q(i)};height:auto;opacity:1;transform:rotate(${a}deg);transform-origin:50% 88%;z-index:6`,e.dataset.fittedCrown=t.pose}function Te(e,t,n,r,i){e.dataset.rehearsal=t;let a=(e,t)=>{let n=r[e?.dataset.resourceKey];n&&t&&$(t,n)};if(t===`allPower`){a(e.querySelector(`.power-standing .cine-body`),e.querySelector(`.power-standing .cine-crown`)),a(e.querySelector(`.cine-seated`),e.querySelector(`.cine-royal-crown`));let t=r.cinema_seatedA,n=e.querySelector(`.cine-throne`);n.style.transform=`translate(${Q(t.throne.x)},${Q(t.throne.y)}) scale(${t.throne.scale})`}if(N[t]&&t!==`exit`&&a(e.querySelector(`.decision-holder .decision-body`),e.querySelector(`.decision-insignia`)),t===`safety`){let t=n.shield.cloneNode();t.className=`fitted-knight-shield`,e.append(t)}let o=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);for(;o.nextNode();)o.currentNode.textContent=o.currentNode.textContent.replace(/Player ([ABC])/gi,(e,t)=>{let n=i[t.toLowerCase()].name;return e===e.toUpperCase()?n.toUpperCase():n})}function Ee(e){let t=document.createElement(`div`);t.className=`loh-scene fitted-loh`,t.innerHTML=`<div class="loh-backdrop"></div><div class="loh-halo"></div><div class="loh-floor"></div><div class="loh-room-pieces"></div><div class="loh-figure"><div class="loh-before loh-pose"></div><div class="loh-royal loh-pose"></div></div><div class="loh-seated"></div><div class="loh-flash"></div><div class="loh-seat-flash"></div><div class="loh-titles"><div class="loh-kicker">ALL HAIL YOUR NEW</div><div class="loh-name">Leader of the Hub</div><div class="loh-title">THE CROWN IS YOURS.</div></div>`;let n=(t,n)=>{let r=e[t].cloneNode();return r.className=n,r};t.querySelector(`.loh-backdrop`).append(n(`cinema_royalRoom`,`loh-backdrop-image`));for(let[e,r]of[[`winner`,`.loh-before`],[`royal`,`.loh-royal`]])t.querySelector(r).append(n(e,`loh-person`),n(`crown`,`loh-crown`));t.querySelector(`.loh-seated`).append(n(`throne`,`loh-seat-throne`),n(`seated`,`loh-seated-image`),n(`crown`,`loh-seated-crown`));let r=t.querySelector(`.loh-room-pieces`);for(let e of[`left`,`right`]){let t=document.createElement(`div`);t.className=`loh-curtain loh-curtain-`+e,t.append(n(`curtain`,`loh-prop-image`)),r.append(t)}return t}function De(e,t){t(e,[[0,0],[180,1],[4020,1],[4400,0]]),t(`.loh-backdrop`,[[0,.35,`scale(1.09)`],[4400,.58,`scale(1.015)`]]),t(`.loh-figure`,[[0,0,`translateY(22px) scale(.94)`],[550,1,`translateY(0) scale(1)`],[2319,1,`scale(1.008)`,`steps(1,end)`],[2320,0],[4400,0]]),t(`.loh-crown`,[[0,0,`translateY(-36px)`],[650,0,`translateY(-36px)`],[1060,1,`translateY(-2px)`],[1160,1,`translateY(0)`],[4400,1,`translateY(0)`]]),t(`.loh-before`,[[0,1],[1300,1],[1660,0],[4400,0]]),t(`.loh-royal`,[[0,0],[1300,0],[1660,1],[4400,1]]),t(`.loh-flash`,[[0,0],[1260,0],[1420,.65],[1770,0],[4400,0]]),t(`.loh-halo`,[[0,0,`scale(.8)`],[580,.7,`scale(1)`],[1700,1,`scale(1.12)`],[4400,.8,`scale(1.15)`]]),t(`.loh-floor`,[[0,0],[600,1],[4400,1]]);for(let[e,n]of[[`left`,-1],[`right`,1]])t(`.loh-curtain-`+e,[[0,0,`translateX(${n*125}px)`],[1120,0,`translateX(${n*125}px)`],[1760,1,`translateX(0)`],[4400,1]]);t(`.loh-seat-flash`,[[0,0],[2170,0],[2260,1],[2370,1],[2610,0],[4400,0]]),t(`.loh-seated`,[[0,0,`scale(1.035)`,`steps(1,end)`],[2320,1,`scale(1.035)`],[2730,1,`scale(1)`],[3980,1,`scale(1.012)`],[4400,1,`scale(1.012)`]]),t(`.loh-titles`,[[0,0,`translateY(10px)`],[1660,0,`translateY(10px)`],[2040,1,`translateY(0)`],[4400,1]])}function Oe(e,t){return new Promise((n,r)=>{let i=new Image,a=()=>{i.removeAttribute(`src`),r(new DOMException(`Cancelled`,`AbortError`))};t.addEventListener(`abort`,a,{once:!0}),i.decoding=`async`,i.alt=``,i.draggable=!1,i.src=new URL(`/bbmobilenew/qa/`+e.src.replace(/^\//,``),document.baseURI).href,e.character&&(i.dataset.character=e.character,i.dataset.pose=e.pose),i.decode().then(()=>{t.removeEventListener(`abort`,a),n(i)},e=>{t.removeEventListener(`abort`,a),r(e)})})}function ke(){let c=[],l=new Set,u=[],d=null,f=null,h=new AbortController,g=!1,_=null,v,y=!1,b=!1,x,S=!1,C=new Set,w=e=>{e.due=performance.now()+e.remaining,e.handle=setTimeout(()=>{l.delete(e),g||e.callback()},e.remaining)},T=(e,t)=>{let n={callback:e,remaining:t,due:0,handle:null};return l.add(n),S||w(n),n},E=()=>{if(g)return;let e=S;S=!0;for(let t of e?[]:l)t.remaining=Math.max(0,t.due-performance.now()),clearTimeout(t.handle),t.handle=null;for(let e of c)e.playState===`running`&&(C.add(e),e.pause())},D=()=>{if(!(g||!S)){S=!1;for(let e of l)w(e);for(let e of C)c.includes(e)&&e.play();C.clear()}},O=()=>{for(let e of c)e.cancel(),e.effect=null;c=[];for(let e of d?.shadowRoot?.querySelectorAll(`img`)??[])e.removeAttribute(`src`);if(d?.shadowRoot?.replaceChildren(),u.forEach(e=>e.remove()),u=[],d?.remove(),d=null,x=null,f)for(let e of Object.values(f.images))e.removeAttribute(`src`);f=null},k=()=>{g=!0,h.abort();for(let e of l)clearTimeout(e.handle);l.clear(),C.clear(),O()};return{stop:k,pause:E,resume:D,setVisible(e){d&&(d.style.visibility=e?`visible`:`hidden`),u.forEach(t=>t.style.visibility=e?`visible`:`hidden`)},async prepare(e,c,l=`doubleEviction`,u={}){v=e;let d=we(e,c,l),p=performance.now();Ce??=Promise.resolve([t,n,r,i,a,o,s,be].join(`
`));let m=await Promise.all(Object.entries(d).map(async([e,t])=>{let n=await Oe(t,h.signal);return n.dataset.resourceKey=e,[e,n]})),_=await Ce;return g?null:(f={images:Object.fromEntries(m),resources:d,css:_,cast:c,details:u,preparationMs:performance.now()-p,transferBytes:[...new Map(Object.values(d).map(e=>[e.src,e])).values()].reduce((e,t)=>e+t.bytes,0),decodedBytes:[...new Map(Object.values(d).map(e=>[e.src,e])).values()].reduce((e,t)=>e+t.width*t.height*4,0)},f)},mount(t,n,r,i=`doubleEviction`,a={}){if(g||!f)return;let o=e(v),s=!!N[o],{images:l,resources:h,css:b,cast:S,details:C}=f;d=document.createElement(`div`),d.className=`game-sample-film`,t.append(d);let w=d.attachShadow({mode:`open`}),E=document.createElement(`style`);E.textContent=b;let D=document.createElement(`div`);if(D.className=`stage is-playing`,x=o?o===`loh`?Ee(l):s?I(o,l,0,{nativeHandoff:!0}):de(o,l,H[i]||H.generic,0):_e(v,l,S,C),o===`nominations`&&l.cinema_standC&&v!==`cupidNominations`){x.classList.add(`nom-three`);let e=x.querySelector(`.nom-second`).cloneNode(!0);e.classList.replace(`nom-second`,`nom-third`);let t=l.cinema_standC.cloneNode();t.className=`nom-person`,e.querySelector(`.nom-person`).replaceWith(t),e.querySelector(`.nom-label span`).textContent=`03`,x.append(e),x.querySelector(`.c-caption strong`).textContent=`Three names. One block.`}if(o===`shock`&&p(x,i,l),o&&Te(x,o,l,h,S),o===`loh`){for(let[e,t]of[[`.loh-before .loh-crown`,`winner`],[`.loh-royal .loh-crown`,`royal`],[`.loh-seated-crown`,`seated`]])$(x.querySelector(e),h[t]);let e=h.seated.throne;x.querySelector(`.loh-seat-throne`).style.transform=`translate(${Q(e.x)},${Q(e.y)}) scale(${e.scale})`,x.querySelector(`.loh-name`).textContent=S.a.name}v!==o&&ge(v,x,l,h,S,C,$),D.append(x),w.append(E,D);let O=Z[v].duration;if(_=document.timeline.currentTime,o===`nominations`&&a.matchHandoff){let e=a.origin;if(d.style.transformOrigin=e?`${e.left+e.width/2}px ${e.top+e.height/2}px`:`50% 50%`,c.push(d.animate([{opacity:0,transform:`scale(1.018)`},{opacity:1,transform:`scale(1)`}],{duration:280,fill:`both`,easing:`cubic-bezier(.18,.65,.3,1)`})),e){let n=document.createElement(`div`);n.className=`vip-nomination-match`,Object.assign(n.style,{position:`fixed`,left:e.left+`px`,top:e.top+`px`,width:e.width+`px`,height:e.height+`px`,border:`1px solid #cfb377`,borderRadius:`18px`,boxShadow:`0 0 24px #c09c5c88`,pointerEvents:`none`,zIndex:10002}),t.append(n),u.push(n),c.push(n.animate([{opacity:0,transform:`scale(1)`},{opacity:1,offset:.3},{opacity:0,transform:`scale(1.12)`}],{duration:360,fill:`both`,easing:`ease-out`})),T(()=>n.remove(),370)}}let A=(e,t)=>{let n=typeof e==`string`?[...x.querySelectorAll(e)]:[e];if(!n.length)throw Error(`Missing film layer `+e);for(let e of n){let n=e.dataset.fittedCrown?e.style.transform:``,r=e.animate(t.map(([t,r,i,s])=>({offset:t/O,opacity:o===`nominations`&&a.matchHandoff&&e===x&&t===O?1:r,...i?{transform:i+(n?` `+n:``)}:{},...s?{easing:s}:{}})),{duration:O,fill:`both`,easing:`linear`});r.startTime=_,c.push(r)}};o?o===`loh`?De(x,A):s?L(o,x,A,{nativeHandoff:!0}):fe(o,x,A,H[i]||H.generic):ve(v,x,A,O,T),o===`nominations`&&l.cinema_standC&&v===o&&(A(`.nom-third`,[[0,0,`translateY(18px)`],[2700,0,`translateY(18px)`],[3280,1,`translateY(0)`],[O,1]]),A(`.nom-third .nom-aura`,[[0,0],[2950,0],[3370,.8],[O,.5]])),o===`shock`&&m(x,i,A,O),v!==o&&ye(v,x,A,O),o===`safety`&&A(`.fitted-knight-shield`,[[0,0],[1680,0],[1810,1],[4200,1]]);let j=s?N[o].avatarAt+140:O;T(()=>{g||(s?(c.forEach(e=>{e.pause(),e.currentTime=j}),y=!0,n()):o===`nominations`&&a.matchHandoff?(n(),c.push(d.animate([{opacity:1,transform:`scale(1)`},{opacity:0,transform:`scale(.985)`}],{duration:240,fill:`both`,easing:`ease-in-out`})),T(()=>{k(),r()},250)):(k(),r()))},j)},nativeReady(e=!1){g||!y||b||(b=!0,T(()=>{if(!d||g)return;let t=d.animate([{opacity:1},{opacity:0}],{duration:e?140:260,fill:`both`});c.push(t),T(O,e?150:270)},e?0:480))},seek(e){for(let e of l)clearTimeout(e.handle);l.clear(),c.forEach(t=>{t.pause(),t.currentTime=e})},get root(){return x},get metrics(){return f?{preparationMs:f.preparationMs,transferBytes:f.transferBytes,decodedBytes:f.decodedBytes}:null},get counts(){return{animations:c.length,timers:l.size,mounted:!!d,retainedImages:f?Object.keys(f.images).length:0}}}}export{xe as OPTIONS,Z as SCENES,ke as createClip,we as sceneResources};
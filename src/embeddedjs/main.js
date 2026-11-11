import Poco from "commodetto/Poco";
import Battery from "embedded:sensor/Battery";
import Health from "pebble/health";

const render = new Poco(screen);

// ---- Config -------------------------------------------------------------
const USE_24H = true;
const SHOW_SECONDS = false;   // leave false: the wider rail no longer leaves room
const SHOW_UTC = true;
const HOSTNAME = "";
const LOW_BATT = 20;          // below this, the meter turns pink

// ---- Fonts --------------------------------------------------------------
const fontTime = new render.Font("Bitham-Bold", 42);
const fontSec = new render.Font("Gothic-Bold", 24);
const fontLine = new render.Font("Gothic-Bold", 18);
const fontSmall = new render.Font("Gothic-Bold", 14);
const fontFoot = new render.Font("Gothic-Regular", 18);
const fontFootAlt = new render.Font("Gothic-Regular", 14);

// ---- Palette ------------------------------------------------------------
const BG = render.makeColor(0, 0, 0);
const BLUE = render.makeColor(85, 170, 255);
const PINK = render.makeColor(255, 170, 170);
const WHITE = render.makeColor(255, 255, 255);
const GREY = render.makeColor(170, 170, 170);
const DIM = render.makeColor(85, 85, 85);
const FOOT = render.makeColor(170, 170, 170);

const W = render.width;
const H = render.height;

// ---- Layout (tuned for Emery, 200x228) ----------------------------------
const RAIL_W = 18;            // was 6
const X = 32;                 // content start, clears the rail
const RIGHT = W - 16;

const Y_DATE = 16;
const Y_TIME = 52;
const Y_UTC = 110;
const Y_RULE = 146;
const Y_BAT = 156;
const Y_NET = 180;
const Y_HR = 204;

const Y_FOOT = 202;

const SEGMENTS = 6;
const SEG_W = 12;
const SEG_GAP = 2;
const SEG_H = 11;
const SEG_X = X + 38;

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

let batteryPercent = 100;
let charging = false;

// Pick the largest footer font that still fits, so a long string can't clip
const footFont =
    render.getTextWidth(HOSTNAME, fontFoot) <= (W - 6 - X) ? fontFoot : fontFootAlt;

// ---- Helpers ------------------------------------------------------------
function pad2(n) {
    return String(n).padStart(2, "0");
}

// Proportional fonts make a ticking clock jitter as digit widths change.
// Drawing each glyph centered in a fixed cell pins the digits in place.
function monoWidth(text, cellW) {
    return text.length * cellW;
}

function drawMono(text, font, color, x, y, cellW) {
    let cx = x;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const w = render.getTextWidth(ch, font);
        render.drawText(ch, font, color, cx + (((cellW - w) / 2) | 0), y);
        cx += cellW;
    }
}

function hour12(h) {
    const v = h % 12;
    return v === 0 ? 12 : v;
}

// ---- Draw ---------------------------------------------------------------
function draw(now) {
    render.begin();

    render.fillRectangle(BG, 0, 0, W, H);

    // Flag rail down the left edge
    const r1 = (H * 4 / 20) | 0;
    const r2 = (H * 7 / 20) | 0;
    const r3 = (H * 13 / 20) | 0;
    const r4 = (H * 16 / 20) | 0;
    render.fillRectangle(BLUE, 0, 0, RAIL_W, r1);
    render.fillRectangle(PINK, 0, r1, RAIL_W, r2 - r1);
    render.fillRectangle(WHITE, 0, r2, RAIL_W, r3 - r2);
    render.fillRectangle(PINK, 0, r3, RAIL_W, r4 - r3);
    render.fillRectangle(BLUE, 0, r4, RAIL_W, H - r4);

    // ISO-8601 date, the way your logs write it
    const dateStr = DAYS[now.getDay()] + " " + now.getFullYear() + "-" +
                    pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());
    render.drawText(dateStr, fontLine, PINK, X, Y_DATE);

    // Local time, monospaced
    const h = USE_24H ? pad2(now.getHours()) : String(hour12(now.getHours()));
    const timeStr = h + ":" + pad2(now.getMinutes());
    const cellW = render.getTextWidth("0", fontTime) + 2;
    drawMono(timeStr, fontTime, WHITE, X, Y_TIME, cellW);

    if (SHOW_SECONDS) {
        const secX = X + monoWidth(timeStr, cellW) + 4;
        render.drawText(":" + pad2(now.getSeconds()), fontSec, GREY,
            secX, Y_TIME + fontTime.height - fontSec.height - 2);
    }

    // UTC, because Defender timestamps are UTC
    if (SHOW_UTC) {
        const utcStr = "UTC " + pad2(now.getUTCHours()) + ":" + pad2(now.getUTCMinutes());
        render.drawText(utcStr, fontLine, BLUE, X, Y_UTC);
    }

    render.fillRectangle(DIM, X, Y_RULE, RIGHT - X, 1);

    // Segmented battery meter
    render.drawText("BAT", fontSmall, DIM, X, Y_BAT);

    const filled = Math.round((batteryPercent / 100) * SEGMENTS);
    const litColor = batteryPercent <= LOW_BATT ? PINK : WHITE;
    for (let i = 0; i < SEGMENTS; i++) {
        render.fillRectangle(i < filled ? litColor : DIM,
            SEG_X + i * (SEG_W + SEG_GAP), Y_BAT + 2, SEG_W, SEG_H);
    }

    const battStr = (charging ? "+" : "") + batteryPercent + "%";
    render.drawText(battStr, fontSmall, litColor,
        RIGHT - render.getTextWidth(battStr, fontSmall), Y_BAT);

    // Phone link status
    const up = !!(watch.connected && watch.connected.app);
    render.drawText("NET", fontSmall, DIM, X, Y_NET);
    render.drawText(up ? "UP" : "DOWN", fontSmall, up ? BLUE : PINK, SEG_X, Y_NET);

    const heartRate = Health.metric.get("heart rate");
    render.drawText("HR", fontSmall, DIM, X, Y_HR);
    render.drawText(heartRate, fontSmall, BLUE, SEG_X, Y_HR);

    render.end();
}

// ---- Wire up ------------------------------------------------------------
const battery = new Battery({
    onSample() {
        const s = this.sample();
        batteryPercent = s.percent;
        charging = s.charging;
        draw(new Date());
    }
});

const initial = battery.sample();
batteryPercent = initial.percent;
charging = initial.charging;

if (watch.addEventListener)
    watch.addEventListener("connected", () => draw(new Date()));

watch.addEventListener(SHOW_SECONDS ? "secondchange" : "minutechange",
    e => draw(e.date));
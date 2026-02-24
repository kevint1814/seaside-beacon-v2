"""
Seaside Beacon — Premium Plan Document Generator
Generates a professional PDF summarizing all premium tier discussions.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ─── Register DejaVu Sans (supports ₹ symbol) ───
pdfmetrics.registerFont(TTFont("DejaVu",      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold",  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Oblique", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-BoldOblique", "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"))
from reportlab.lib.fonts import addMapping
addMapping("DejaVu", 0, 0, "DejaVu")
addMapping("DejaVu", 1, 0, "DejaVu-Bold")
addMapping("DejaVu", 0, 1, "DejaVu-Oblique")
addMapping("DejaVu", 1, 1, "DejaVu-BoldOblique")

# ─── Brand Colors ───
ZENITH      = HexColor("#04050f")
SKY_MID     = HexColor("#0a0d1f")
COPPER      = HexColor("#c4733a")
AMBER       = HexColor("#d4924a")
GOLD        = HexColor("#c9a055")
WARM_BG     = HexColor("#faf8f5")
SOFT_BG     = HexColor("#f5f1eb")
TEXT_PRIMARY = HexColor("#1a1a1a")
TEXT_SECONDARY = HexColor("#4a4a4a")
TEXT_MUTED   = HexColor("#7a7a7a")
BORDER_LIGHT = HexColor("#e8e0d4")
ACCENT_BG    = HexColor("#fdf5ed")

OUTPUT_PATH = "/sessions/determined-beautiful-turing/mnt/COPY_seaside-beacon-v2/Seaside_Beacon_Premium_Plan.pdf"

# ─── Styles ───
styles = {
    "title": ParagraphStyle(
        "title",
        fontName="DejaVu-Bold",
        fontSize=26,
        leading=32,
        textColor=ZENITH,
        spaceAfter=4*mm,
        alignment=TA_LEFT,
    ),
    "subtitle": ParagraphStyle(
        "subtitle",
        fontName="DejaVu",
        fontSize=12,
        leading=18,
        textColor=TEXT_MUTED,
        spaceAfter=10*mm,
        alignment=TA_LEFT,
    ),
    "h1": ParagraphStyle(
        "h1",
        fontName="DejaVu-Bold",
        fontSize=18,
        leading=24,
        textColor=ZENITH,
        spaceBefore=10*mm,
        spaceAfter=5*mm,
    ),
    "h2": ParagraphStyle(
        "h2",
        fontName="DejaVu-Bold",
        fontSize=13,
        leading=18,
        textColor=COPPER,
        spaceBefore=6*mm,
        spaceAfter=3*mm,
    ),
    "body": ParagraphStyle(
        "body",
        fontName="DejaVu",
        fontSize=10.5,
        leading=16,
        textColor=TEXT_PRIMARY,
        spaceAfter=3*mm,
    ),
    "body_muted": ParagraphStyle(
        "body_muted",
        fontName="DejaVu",
        fontSize=10,
        leading=15,
        textColor=TEXT_SECONDARY,
        spaceAfter=3*mm,
    ),
    "bullet": ParagraphStyle(
        "bullet",
        fontName="DejaVu",
        fontSize=10.5,
        leading=16,
        textColor=TEXT_PRIMARY,
        leftIndent=12*mm,
        bulletIndent=5*mm,
        spaceAfter=2*mm,
    ),
    "label": ParagraphStyle(
        "label",
        fontName="DejaVu-Bold",
        fontSize=9,
        leading=12,
        textColor=COPPER,
        spaceBefore=2*mm,
        spaceAfter=1*mm,
        tracking=2,
    ),
    "table_header": ParagraphStyle(
        "table_header",
        fontName="DejaVu-Bold",
        fontSize=9.5,
        leading=13,
        textColor=white,
        alignment=TA_CENTER,
    ),
    "table_cell": ParagraphStyle(
        "table_cell",
        fontName="DejaVu",
        fontSize=9.5,
        leading=13,
        textColor=TEXT_PRIMARY,
        alignment=TA_CENTER,
    ),
    "table_cell_left": ParagraphStyle(
        "table_cell_left",
        fontName="DejaVu",
        fontSize=9.5,
        leading=13,
        textColor=TEXT_PRIMARY,
        alignment=TA_LEFT,
    ),
    "footer": ParagraphStyle(
        "footer",
        fontName="DejaVu",
        fontSize=8,
        leading=10,
        textColor=TEXT_MUTED,
        alignment=TA_CENTER,
    ),
    "callout": ParagraphStyle(
        "callout",
        fontName="DejaVu-Oblique",
        fontSize=11,
        leading=17,
        textColor=COPPER,
        spaceAfter=4*mm,
        leftIndent=5*mm,
        rightIndent=5*mm,
    ),
    "price_big": ParagraphStyle(
        "price_big",
        fontName="DejaVu-Bold",
        fontSize=28,
        leading=34,
        textColor=ZENITH,
        alignment=TA_CENTER,
    ),
    "price_sub": ParagraphStyle(
        "price_sub",
        fontName="DejaVu",
        fontSize=10,
        leading=14,
        textColor=TEXT_MUTED,
        alignment=TA_CENTER,
    ),
}


def header_footer(canvas_obj, doc):
    """Draw page header line and footer."""
    canvas_obj.saveState()
    w, h = A4

    # Top accent line
    canvas_obj.setStrokeColor(COPPER)
    canvas_obj.setLineWidth(1.5)
    canvas_obj.line(20*mm, h - 14*mm, w - 20*mm, h - 14*mm)

    # Header text
    canvas_obj.setFont("DejaVu", 7.5)
    canvas_obj.setFillColor(TEXT_MUTED)
    canvas_obj.drawString(20*mm, h - 12*mm, "SEASIDE BEACON")
    canvas_obj.drawRightString(w - 20*mm, h - 12*mm, "PREMIUM PLAN — INTERNAL")

    # Footer
    canvas_obj.setStrokeColor(BORDER_LIGHT)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(20*mm, 16*mm, w - 20*mm, 16*mm)
    canvas_obj.setFont("DejaVu", 7.5)
    canvas_obj.setFillColor(TEXT_MUTED)
    canvas_obj.drawString(20*mm, 11*mm, "Confidential — February 2026")
    canvas_obj.drawRightString(w - 20*mm, 11*mm, f"Page {doc.page}")

    canvas_obj.restoreState()


def make_divider():
    return HRFlowable(
        width="100%", thickness=0.5,
        color=BORDER_LIGHT, spaceBefore=4*mm, spaceAfter=4*mm
    )


def make_accent_box(text):
    """Create a callout box with amber left border."""
    t = Table(
        [[Paragraph(text, styles["callout"])]],
        colWidths=[150*mm],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ("LINEBEFOREDECOR", (0, 0), (0, -1)),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    return t


def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        topMargin=22*mm,
        bottomMargin=22*mm,
        leftMargin=20*mm,
        rightMargin=20*mm,
        title="Seaside Beacon — Premium Plan",
        author="Seaside Beacon",
    )

    story = []
    W = 170*mm  # usable width

    # ═══════════════════════════════════════
    # COVER / TITLE
    # ═══════════════════════════════════════
    story.append(Spacer(1, 15*mm))
    story.append(Paragraph("PREMIUM PLAN", styles["label"]))
    story.append(Paragraph("Seaside Beacon", styles["title"]))
    story.append(Paragraph(
        "India's first native sunrise quality forecaster — monetization strategy, "
        "feature breakdown, pricing, and implementation roadmap.",
        styles["subtitle"]
    ))
    story.append(make_divider())

    # ═══════════════════════════════════════
    # 1. VISION & MISSION
    # ═══════════════════════════════════════
    story.append(Paragraph("1. Vision", styles["h1"]))
    story.append(Paragraph(
        "Seaside Beacon is a one-person project built, maintained, and funded by a student "
        "with a passion for the coastline and its life. The weather APIs, AI models, and "
        "servers behind every forecast cost real money. A premium tier ensures the project's "
        "sustainability while keeping the core forecast free and accessible.",
        styles["body"]
    ))
    story.append(make_accent_box(
        '"Your beaches get a better forecast. This project gets to keep going."'
    ))

    # ═══════════════════════════════════════
    # 2. TIER COMPARISON
    # ═══════════════════════════════════════
    story.append(Paragraph("2. Free vs Premium", styles["h1"]))
    story.append(Paragraph(
        "The free tier retains the core value proposition — tomorrow's sunrise forecast and "
        "a 4 AM email alert. Premium unlocks deeper forecasting, photography intelligence, "
        "and multi-channel alerts.",
        styles["body"]
    ))

    # Comparison table
    header = [
        Paragraph("<b>Feature</b>", styles["table_header"]),
        Paragraph("<b>Free</b>", styles["table_header"]),
        Paragraph("<b>Premium</b>", styles["table_header"]),
    ]

    def row(feature, free, premium):
        return [
            Paragraph(feature, styles["table_cell_left"]),
            Paragraph(free, styles["table_cell"]),
            Paragraph(premium, styles["table_cell"]),
        ]

    table_data = [
        header,
        row("Tomorrow's forecast", "Yes", "Yes"),
        row("7-day forecast", "—", "Yes"),
        row("Basic conditions", "Yes", "Yes"),
        row("Photography insights (DSLR + Mobile)", "—", "Yes"),
        row("4 AM email alert", "Yes", "Yes (enhanced)"),
        row("8:30 PM evening preview", "—", "Yes"),
        row("Flexible email timing", "—", "Yes"),
        row("Special 70+ score alert", "—", "Email + Telegram"),
        row("Telegram daily alerts", "—", "Yes"),
    ]

    t = Table(table_data, colWidths=[75*mm, 40*mm, 55*mm])
    t.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), COPPER),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        # Alternating rows
        ("BACKGROUND", (0, 1), (-1, 1), WARM_BG),
        ("BACKGROUND", (0, 2), (-1, 2), white),
        ("BACKGROUND", (0, 3), (-1, 3), WARM_BG),
        ("BACKGROUND", (0, 4), (-1, 4), white),
        ("BACKGROUND", (0, 5), (-1, 5), WARM_BG),
        ("BACKGROUND", (0, 6), (-1, 6), white),
        ("BACKGROUND", (0, 7), (-1, 7), WARM_BG),
        ("BACKGROUND", (0, 8), (-1, 8), white),
        ("BACKGROUND", (0, 9), (-1, 9), WARM_BG),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    story.append(t)
    story.append(Spacer(1, 4*mm))

    # ═══════════════════════════════════════
    # 3. PRICING
    # ═══════════════════════════════════════
    story.append(Paragraph("3. Pricing", styles["h1"]))

    # Pricing cards as a table
    monthly_content = [
        [Paragraph("<b>Monthly</b>", ParagraphStyle("mc", fontName="DejaVu-Bold", fontSize=11, textColor=TEXT_SECONDARY, alignment=TA_CENTER))],
        [Paragraph("<b><font size=28>₹49</font></b><font size=10 color='#7a7a7a'>/month</font>", ParagraphStyle("mp", fontName="DejaVu-Bold", fontSize=28, textColor=ZENITH, alignment=TA_CENTER, leading=36))],
        [Paragraph("Less than ₹2 a day", ParagraphStyle("ms", fontName="DejaVu", fontSize=9, textColor=AMBER, alignment=TA_CENTER))],
    ]

    annual_content = [
        [Paragraph("<b>Annual</b>", ParagraphStyle("ac", fontName="DejaVu-Bold", fontSize=11, textColor=TEXT_SECONDARY, alignment=TA_CENTER))],
        [Paragraph("<b><font size=28>₹399</font></b><font size=10 color='#7a7a7a'>/year</font>", ParagraphStyle("ap", fontName="DejaVu-Bold", fontSize=28, textColor=ZENITH, alignment=TA_CENTER, leading=36))],
        [Paragraph("Save 32% — less than a chai a week", ParagraphStyle("as", fontName="DejaVu", fontSize=9, textColor=AMBER, alignment=TA_CENTER))],
    ]

    m_table = Table(monthly_content, colWidths=[70*mm])
    m_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARM_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))

    a_table = Table(annual_content, colWidths=[70*mm])
    a_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_BG),
        ("BOX", (0, 0), (-1, -1), 1, COPPER),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))

    pricing_row = Table([[m_table, Spacer(10*mm, 1), a_table]], colWidths=[75*mm, 10*mm, 75*mm])
    pricing_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(pricing_row)
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph(
        "Autopay subscription via Razorpay — users select monthly or annual at checkout. "
        "UPI, cards, and wallets supported. Cancel anytime. Zero spam.",
        styles["body_muted"]
    ))
    story.append(Paragraph(
        "Razorpay charges a 2% transaction fee. Net revenue: ₹48.02/month or ₹390.98/year per subscriber.",
        styles["body_muted"]
    ))

    # ═══════════════════════════════════════
    # 4. ALERT SCHEDULE
    # ═══════════════════════════════════════
    story.append(Paragraph("4. Alert Schedule", styles["h1"]))
    story.append(Paragraph(
        "Alerts are the core value delivery mechanism. The schedule is designed to give "
        "premium users actionable intelligence at every decision point.",
        styles["body"]
    ))

    alert_header = [
        Paragraph("<b>Time</b>", styles["table_header"]),
        Paragraph("<b>Alert</b>", styles["table_header"]),
        Paragraph("<b>Channel</b>", styles["table_header"]),
        Paragraph("<b>Who</b>", styles["table_header"]),
    ]

    def alert_row(time, alert, channel, who):
        return [
            Paragraph(time, styles["table_cell"]),
            Paragraph(alert, styles["table_cell_left"]),
            Paragraph(channel, styles["table_cell"]),
            Paragraph(who, styles["table_cell"]),
        ]

    alert_data = [
        alert_header,
        alert_row("7:00 PM", "Special 70+ score alert", "Email + Telegram", "Premium only"),
        alert_row("8:30 PM", "Evening preview", "Email + Telegram", "Premium only"),
        alert_row("4:00 AM", "Final forecast (basic)", "Email", "Free users"),
        alert_row("4:00 AM", "Final forecast (enhanced + photography)", "Email + Telegram", "Premium users"),
    ]

    at = Table(alert_data, colWidths=[28*mm, 60*mm, 42*mm, 40*mm])
    at.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COPPER),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BACKGROUND", (0, 1), (-1, 1), ACCENT_BG),
        ("BACKGROUND", (0, 2), (-1, 2), ACCENT_BG),
        ("BACKGROUND", (0, 3), (-1, 3), WARM_BG),
        ("BACKGROUND", (0, 4), (-1, 4), ACCENT_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    story.append(at)
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        "Premium users can customise their email delivery time. "
        "Telegram alerts mirror the email schedule automatically.",
        styles["body_muted"]
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════
    # 5. TECH STACK & COSTS
    # ═══════════════════════════════════════
    story.append(Paragraph("5. Technology Stack and Costs", styles["h1"]))

    story.append(Paragraph("Weather Data", styles["h2"]))
    story.append(Paragraph(
        "Open-Meteo provides up to 16 days of forecast data for free — cloud layers (high, mid, low), "
        "humidity, visibility, wind, and precipitation. This covers the 7-day premium forecast with no "
        "additional API cost. AccuWeather serves as a backup data source.",
        styles["body"]
    ))

    story.append(Paragraph("AI / Photography Insights", styles["h2"]))
    story.append(Paragraph(
        "Google Gemini Flash generates DSLR and mobile photography recommendations — camera settings, "
        "composition tips, and golden hour timing — personalised to each morning's conditions.",
        styles["body"]
    ))

    story.append(Paragraph("Email Delivery", styles["h2"]))
    story.append(Paragraph(
        "Brevo (formerly Sendinblue) handles transactional email. Free tier allows 300 emails/day, "
        "sufficient for the initial subscriber base. Paid tiers scale as needed.",
        styles["body"]
    ))

    story.append(Paragraph("Telegram Alerts", styles["h2"]))
    story.append(Paragraph(
        "Telegram Bot API is completely free with no per-message cost and no rate limits for reasonable "
        "usage. Users connect via a simple /start command in the bot. This replaces the initially "
        "considered WhatsApp Business API (which costs ~₹0.88 per message) and SMS.",
        styles["body"]
    ))

    story.append(Paragraph("Payments", styles["h2"]))
    story.append(Paragraph(
        "Razorpay handles subscription billing with autopay support. Users choose monthly (₹49) or annual "
        "(₹399) at checkout. Supports UPI, debit/credit cards, and wallets. 2% transaction fee. "
        "Razorpay Subscriptions API manages recurring billing automatically — no manual charge logic needed.",
        styles["body"]
    ))

    story.append(Paragraph("Authentication", styles["h2"]))
    story.append(Paragraph(
        "Magic link authentication — no passwords. User enters their email, receives a one-time login link, "
        "and gets an auth cookie. Simple, secure, and zero friction. No account creation wall — the site "
        "stays open. Login is only required to access premium features.",
        styles["body"]
    ))

    # Cost summary table
    story.append(Paragraph("Operational Cost Summary", styles["h2"]))

    cost_header = [
        Paragraph("<b>Service</b>", styles["table_header"]),
        Paragraph("<b>Cost</b>", styles["table_header"]),
        Paragraph("<b>Notes</b>", styles["table_header"]),
    ]

    def cost_row(service, cost, notes):
        return [
            Paragraph(service, styles["table_cell_left"]),
            Paragraph(cost, styles["table_cell"]),
            Paragraph(notes, styles["table_cell_left"]),
        ]

    cost_data = [
        cost_header,
        cost_row("Open-Meteo", "Free", "16-day forecast, all cloud layers"),
        cost_row("Gemini Flash", "Free tier", "Photography insights generation"),
        cost_row("Brevo (Email)", "Free — 300/day", "Scales to paid tiers"),
        cost_row("Telegram Bot API", "Free", "Unlimited messages"),
        cost_row("Razorpay", "2% per txn", "UPI, cards, wallets, autopay"),
        cost_row("Server / Hosting", "Variable", "Node.js + MongoDB"),
    ]

    ct = Table(cost_data, colWidths=[45*mm, 35*mm, 90*mm])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COPPER),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BACKGROUND", (0, 1), (-1, 1), WARM_BG),
        ("BACKGROUND", (0, 2), (-1, 2), white),
        ("BACKGROUND", (0, 3), (-1, 3), WARM_BG),
        ("BACKGROUND", (0, 4), (-1, 4), white),
        ("BACKGROUND", (0, 5), (-1, 5), WARM_BG),
        ("BACKGROUND", (0, 6), (-1, 6), white),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]))
    story.append(ct)

    # ═══════════════════════════════════════
    # 6. MODAL & CONVERSION STRATEGY
    # ═══════════════════════════════════════
    story.append(Paragraph("6. Conversion Strategy", styles["h1"]))
    story.append(Paragraph(
        "The premium pitch is integrated into the existing modal system across three contexts, "
        "ensuring visibility without being intrusive.",
        styles["body"]
    ))

    story.append(Paragraph("Modal Contexts", styles["h2"]))

    story.append(Paragraph(
        "<b>Before 6 PM (countdown active)</b> — The modal shows a countdown to the next forecast, "
        "a brief explanation of the scoring system, the free email subscribe form, and the premium "
        "pitch below a separator. All in one unified modal.",
        styles["body"]
    ))
    story.append(Paragraph(
        "<b>After 6 PM (auto-prompt)</b> — Fires 3 seconds after a forecast loads. Leads with "
        '"Get this in your inbox — free" and the subscribe form, followed by a separator and '
        "the premium pitch. Dismissed modals have a 1-day cooldown (localStorage).",
        styles["body"]
    ))
    story.append(Paragraph(
        "<b>Daily Briefing link</b> — Same structure as the after-6 PM modal. Always available "
        "via the Daily Briefing button in the UI.",
        styles["body"]
    ))

    story.append(Paragraph("Premium Pitch Design", styles["h2"]))
    story.append(Paragraph(
        "The premium pitch follows a storyteller structure (Draft A) combined with Draft C's "
        "pricing box and mission closer. Key design decisions:",
        styles["body"]
    ))
    story.append(Paragraph(
        "Narrative-first — the story paragraph leads with the student/indie builder angle, with "
        'the key phrase "a student with a passion for the coastline and its life" in bold.',
        styles["bullet"]
    ))
    story.append(Paragraph(
        "Minimal SVG line icons — thin copper-stroke icons (calendar, sun, message bubble, sunrise) "
        "replace emojis for a premium, restrained feel.",
        styles["bullet"]
    ))
    story.append(Paragraph(
        "Side-by-side pricing — monthly and annual shown together with a \"save 32%\" nudge.",
        styles["bullet"]
    ))
    story.append(Paragraph(
        "Trust line — \"Cancel anytime \u00b7 Zero spam\" placed directly above the CTA button.",
        styles["bullet"]
    ))
    story.append(Paragraph(
        "Mission closer — \"Starting with Chennai's beaches, expanding to coastlines across India. "
        "Your support helps us get there.\"",
        styles["bullet"]
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════
    # 7. IMPLEMENTATION ROADMAP
    # ═══════════════════════════════════════
    story.append(Paragraph("7. Implementation Roadmap", styles["h1"]))
    story.append(Paragraph(
        "Nine phases, each self-contained and deployable independently.",
        styles["body"]
    ))

    phases = [
        ("Phase 1", "Backend Infrastructure",
         "PremiumUser MongoDB model (email, plan, status, Razorpay subscription ID, Telegram chat ID, "
         "preferred alert time). Magic link auth endpoints — POST /auth/magic-link (send), "
         "GET /auth/verify (validate). Razorpay webhook endpoint for subscription lifecycle events."),
        ("Phase 2", "Razorpay Autopay Subscriptions",
         "Create two Razorpay subscription plans: monthly (₹49) and annual (₹399). Frontend checkout "
         "flow — user selects plan, Razorpay Checkout opens, autopay mandate is set up. Webhook handles "
         "subscription.activated, subscription.charged, subscription.cancelled events."),
        ("Phase 3", "7-Day Forecast",
         "New API endpoint returning 7 days of scored forecasts. Open-Meteo 7-day fetch with full cloud "
         "layer data. Each day scored using the existing v5.4 algorithm. Frontend calendar/card view for premium users."),
        ("Phase 4", "Photography Paywall",
         "Lock DSLR and Mobile photography tabs for free users. Show a premium teaser with blurred preview "
         "and upgrade prompt. Gemini Flash generates personalised camera settings per morning."),
        ("Phase 5", "Email System Overhaul",
         "Remove 8:30 PM evening preview from free tier. Add enhanced 4 AM template for premium (includes "
         "photography insights). Add 8:30 PM evening preview for premium with configurable timing. "
         "Special 70+ score email template with distinct design."),
        ("Phase 6", "Telegram Bot",
         "Create bot via @BotFather. /start command links Telegram account to premium subscription. "
         "Daily forecast messages mirror email content. Instant 70+ score alerts at 7 PM."),
        ("Phase 7", "Magic Link Login UI",
         "Login link in site navigation. Email input, magic link sent, auth cookie set on verification. "
         "Premium badge and account section in UI for logged-in users."),
        ("Phase 8", "Modal Redesign",
         "Merge free subscribe form and premium pitch into all three modal contexts (before 6 PM, "
         "after 6 PM auto-prompt, Daily Briefing). Implement the refined storyteller pitch with "
         "SVG icons, pricing box, trust line, and mission closer."),
        ("Phase 9", "Testing and Deployment",
         "End-to-end flow testing: subscribe, pay, receive alerts, cancel. Razorpay test mode validation. "
         "Email deliverability checks. Telegram bot connection flow. Load testing for 7-day forecast endpoint."),
    ]

    for phase_num, phase_title, phase_desc in phases:
        story.append(Paragraph(f"{phase_num}: {phase_title}", styles["h2"]))
        story.append(Paragraph(phase_desc, styles["body"]))

    story.append(make_divider())

    # ═══════════════════════════════════════
    # 8. MESSAGING COPY
    # ═══════════════════════════════════════
    story.append(Paragraph("8. Approved Messaging Copy", styles["h1"]))
    story.append(Paragraph(
        "Final copy for the premium pitch section, approved after multiple iterations:",
        styles["body_muted"]
    ))

    story.append(make_accent_box(
        "Seaside Beacon is India's first native sunrise quality forecaster, a one-person project "
        "built, maintained, and funded by a student with a passion for the coastline and its life. "
        "The weather APIs, AI models, and servers behind every forecast cost real money. "
        "₹49/month — less than ₹2 a day — less than a chai a week — keeps the forecasts running "
        "and the 4 AM emails going out. You get 7-day forecasts, photography insights, and "
        "Telegram alerts on the mornings that matter. Your beaches get a better forecast, and this "
        "project gets the life to keep going. Starting with Chennai's beaches, expanding to "
        "coastlines across India. Your support helps us get there."
    ))

    story.append(Spacer(1, 8*mm))

    # ═══════════════════════════════════════
    # END
    # ═══════════════════════════════════════
    story.append(make_divider())
    story.append(Paragraph(
        "Seaside Beacon — Premium Plan Document — February 2026",
        styles["footer"]
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"PDF generated: {OUTPUT_PATH}")


if __name__ == "__main__":
    build_pdf()

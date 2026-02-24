// ==========================================
// Support Ticket Model
// Created via Telegram bot when users need help
// ==========================================

const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  // Who raised it
  userEmail: { type: String, default: null },
  userName: { type: String, default: null },
  telegramChatId: { type: String, required: true },
  // Ticket content
  category: {
    type: String,
    enum: ['payment', 'account', 'forecast', 'bug', 'feature', 'general'],
    default: 'general'
  },
  subject: { type: String, required: true },
  description: { type: String, required: true },
  // Status
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open'
  },
  adminNotes: { type: String, default: null },
  resolvedAt: { type: Date, default: null }
}, {
  timestamps: true  // createdAt, updatedAt
});

// Generate a short ticket ID like "SB-0042"
supportTicketSchema.statics.generateTicketId = async function () {
  const count = await this.countDocuments();
  return `SB-${String(count + 1).padStart(4, '0')}`;
};

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

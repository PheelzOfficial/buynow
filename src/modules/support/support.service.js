import { Ticket } from './ticket.model.js';

export async function createTicket({ input, userId }) {
  return { data: await Ticket.create({ ...input, userId }), meta: null };
}

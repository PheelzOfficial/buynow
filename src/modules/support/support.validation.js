import { z } from 'zod';

export const createTicketBodySchema = z.strictObject({
  subject: z.string().trim().min(3).max(150).meta({
    description: 'Short summary of the issue, 3–150 characters.',
    example: 'Order arrived damaged',
  }),
  message: z.string().trim().min(10).max(5000).meta({
    description:
      'Full description for the support team, 10–5000 characters. Include order IDs if relevant.',
    example: 'My order 665f1c2e9b1d4a3f8c7e2a11 arrived with a cracked screen.',
  }),
});

import '../src/config/env.js';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Category, Product, User } from '../src/database/models.js';
import { password, email } from '../src/common/validation/schemas.js';
import { uploadImage, validatedImage } from '../src/modules/media/media.service.js';
const mediaOnly = process.argv.includes('--media-only');
const catalog = JSON.parse(await fs.readFile(new URL('./catalog.json', import.meta.url)));
const reportPath = new URL('../seed-report.json', import.meta.url);
let report = { images: {}, replacements: [], completed: false };
try {
  report = JSON.parse(await fs.readFile(reportPath));
} catch {}
async function download(url) {
  const u = new URL(url);
  if (
    !['images.unsplash.com', 'res.cloudinary.com', 'cdn.dummyjson.com'].includes(u.hostname) ||
    u.protocol !== 'https:'
  )
    throw Error('Unapproved image host');
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  if (!r.headers.get('content-type')?.startsWith('image/')) throw Error('Not an image');
  let size = 0;
  const chunks = [];
  for await (const chunk of r.body) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw Error('Image too large');
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  await validatedImage(buffer);
  return buffer;
}
async function image(url, key, fallback) {
  if (report.images[key] && (!report.images[key].source || report.images[key].source === url)) {
    try {
      await download(report.images[key].url);
      return report.images[key];
    } catch {}
  }
  let buffer;
  try {
    buffer = await download(url);
  } catch {
    if (!fallback || fallback === url) throw Error(`No valid image for ${key}`);
    buffer = await download(fallback);
    report.replacements.push({ key, original: url, replacement: fallback });
  }
  const uploaded = await uploadImage(buffer, key);
  const result = { url: uploaded.secure_url, publicId: uploaded.public_id, source: url };
  report.images[key] = result;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return result;
}
try {
  if (!mediaOnly) {
    // One object schema so each error names its variable (values are never printed).
    z.object({
      MONGODB_URI: z.string().min(1),
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: password,
    }).parse(process.env);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  }
  for (const c of catalog.categories) {
    const fallback = catalog.products.find((p) => p.categoryId === c.id)?.images[0];
    const img = await image(c.image, `categories/${c.id}`, fallback);
    if (!mediaOnly)
      await Category.updateOne(
        { _id: c.id },
        { $setOnInsert: { name: c.name, image: img.url, imagePublicId: img.publicId } },
        { upsert: true },
      );
    console.log(`Category ${c.id}: image validated and uploaded`);
  }
  for (const p of catalog.products) {
    const c = catalog.categories.find((c) => c.id === p.categoryId);
    const images = [];
    for (let i = 0; i < p.images.length; i++)
      images.push(
        await image(
          p.images[i],
          `products/${p.id}-${i}`,
          report.images[`categories/${c.id}`]?.url || c.image,
        ),
      );
    if (!mediaOnly) {
      const { id, ...data } = p;
      await Product.updateOne(
        { _id: id },
        {
          $setOnInsert: {
            ...data,
            images: images.map((i) => i.url),
            imagePublicIds: images.map((i) => i.publicId),
          },
        },
        { upsert: true },
      );
    }
    console.log(`Product ${p.id}: image validated and uploaded`);
  }
  if (!mediaOnly) {
    const adminEmail = process.env.ADMIN_EMAIL.toLowerCase();
    const existing = await User.findOne({ email: adminEmail });
    if (existing && existing.role !== 'admin')
      throw Error('Admin email belongs to a customer; refusing to promote automatically');
    if (!existing)
      await User.create({
        email: adminEmail,
        username: process.env.ADMIN_USERNAME || 'BuyNow Admin',
        password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
        role: 'admin',
        verified: true,
      });
    const counts = await Product.aggregate([
      { $match: { active: true } },
      { $group: { _id: '$categoryId', total: { $sum: 1 } } },
    ]);
    for (const c of catalog.categories)
      if ((counts.find((v) => v._id === c.id)?.total || 0) < 10)
        throw Error(`Category ${c.id} has fewer than ten active products`);
    report.counts = counts;
    report.completed = true;
    console.log('Verified admin account and at least 10 active products per category');
  }
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
} catch (e) {
  console.error(
    `Seed failed (${e.name}): ${
      e instanceof z.ZodError
        ? `invalid configuration in backend/.env:\n${e.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`
        : e.message.replace(/mongodb[^\s]*/gi, '[redacted]')
    }`,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

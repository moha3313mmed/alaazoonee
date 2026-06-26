/**
 * تجزئة كلمات المرور والتحقق منها (hash).
 *
 * نستخدم خوارزمية scrypt المضمّنة في وحدة `crypto` لدى Node.js (دون الاعتماد على
 * مكتبات خارجية)، مع مِلح (salt) عشوائي لكل كلمة مرور، ومقارنة بزمن ثابت لتفادي
 * هجمات التوقيت. تُخزَّن النتيجة بصيغة `scrypt$N$r$p$saltHex$hashHex`.
 *
 * المتطلبات: 1.1 (التحقق من كلمة المرور المجزّأة عند تسجيل الدخول).
 */
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

/** معاملات scrypt (متوازنة بين الأمان والأداء). */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
/** طول المِلح بالبايت. */
const SALT_BYTES = 16;
/** طول المفتاح المشتق بالبايت. */
const KEY_LEN = 64;

/**
 * يجزّئ كلمة المرور وينتج سلسلة قابلة للتخزين في `User.passwordHash`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password, salt, KEY_LEN, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
  })) as Buffer;

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * يتحقق من تطابق كلمة المرور مع التجزئة المخزّنة.
 * يعيد `false` بأمان عند أي تنسيق غير صالح بدلاً من رمي استثناء.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const derived = (await scrypt(password, salt, expected.length, {
    N,
    r,
    p,
  })) as Buffer;

  // مقارنة بزمن ثابت لتفادي تسريب المعلومات عبر التوقيت.
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}

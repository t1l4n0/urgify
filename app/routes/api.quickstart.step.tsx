import { json, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeShop } from "../utils/shop-utils";
import { z } from "zod";
import { shouldRateLimit } from "../utils/rateLimiting";

// Input validation schema
const quickstartStepSchema = z.object({
  shop: z.string().min(1, 'Shop is required'),
  step: z.enum(['activateEmbed'], { errorMap: () => ({ message: 'Invalid step' }) }),
  to: z.enum(['clicked', 'done'], { errorMap: () => ({ message: 'Invalid action' }) }),
});

export async function action({ request }: ActionFunctionArgs) {
  try {
    // Check rate limiting
    const rateLimitCheck = await shouldRateLimit(request, 'api');
    if (rateLimitCheck.limited) {
      return json(
        { success: false, error: rateLimitCheck.error },
        { 
          status: 429, 
          headers: { 
            'Retry-After': rateLimitCheck.retryAfter?.toString() || '60',
            'Cache-Control': 'no-store' 
          } 
        }
      );
    }

    const body = await request.json();
    const { shop: raw, step, to } = quickstartStepSchema.parse(body);
    const shop = normalizeShop(raw);

    if (step === "activateEmbed" && (to === "clicked" || to === "done")) {
      await prisma.quickstartProgress.upsert({
        where: { shop },
        update: { activateEmbed: to },
        create: { shop, activateEmbed: to },
      });
    }

    return json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("quickstart-step error", e);
    
    if (e instanceof z.ZodError) {
      const errorMessage = e.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      return json(
        { success: false, error: `Validation failed: ${errorMessage}` },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    
    return json(
      { success: false, error: "server_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireUser } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const user = await requireUser(req)
    return jsonResponse(
      {
        ok: true,
        message: 'hello from beatlane',
        userId: user.id,
      },
      200,
      req,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    const status =
      message === 'Missing Authorization header' || message === 'Invalid JWT'
        ? 401
        : 500
    return jsonResponse({ ok: false, error: message }, status, req)
  }
})

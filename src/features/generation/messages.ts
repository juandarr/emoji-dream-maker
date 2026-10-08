import type { Locale } from "@/lib/types";
import type { GenerationRun } from "./model";

export const generationErrors = {
  en: {
    canceled: "Generation canceled. Provider processing may continue; this request will not retry.",
    failed: "Generation failed. Check the connection and selected model, then try again.",
    origin: "The app address could not be verified. Reload the page and try again.",
    validation: "Choose a valid canvas, output format, language, and configured model.",
    setup: "OpenRouter is not connected. Add OPENROUTER_API_KEY to .env.local and restart the server.",
    conflict: "This request was already used for different input. Start a new generation.",
    limit: "Generation limit reached. Wait a minute before trying again.",
    auth: "OpenRouter rejected the API key. Update OPENROUTER_API_KEY and restart the server.",
    credits: "OpenRouter needs credits or a higher key budget.",
    permissions: "OpenRouter blocked this request. Check your key permissions and provider settings.",
    rateLimit: "OpenRouter is busy or has reached its request limit. Wait before generating again.",
    model: "This model or a provider supporting these settings is unavailable. Choose another model or its default reasoning effort.",
    settings: "OpenRouter rejected these settings. Choose a supported reasoning effort or the model default.",
    provider: "OpenRouter could not complete the request. Check the selected model and provider settings.",
    budget: "The model used the completion budget before producing an answer. Lower the reasoning effort or increase OPENROUTER_MAX_COMPLETION_TOKENS in .env.local, then restart the server.",
    empty: "The model returned no text. Try another configured text model.",
    incomplete: "The model returned an incomplete creation. Try another configured text model.",
    unknown: "The outcome is unknown. OpenRouter may have processed this request. Check your OpenRouter activity before generating again.",
    unreadable: "OpenRouter returned an unreadable response. Check your OpenRouter activity before trying again.",
    interrupted: "The request was interrupted and its outcome is unknown. Check your OpenRouter activity before generating again. It will not be retried automatically.",
  },
  es: {
    canceled: "Generación cancelada. El proveedor puede seguir procesando; esta solicitud no se reintentará.",
    failed: "No se pudo generar la creación. Comprueba la conexión y el modelo elegido e inténtalo de nuevo.",
    origin: "No se pudo verificar la dirección de la app. Recarga la página e inténtalo de nuevo.",
    validation: "Elige un lienzo válido, un formato, un idioma y un modelo configurado.",
    setup: "OpenRouter no está conectado. Añade OPENROUTER_API_KEY a .env.local y reinicia el servidor.",
    conflict: "Esta solicitud ya se usó con otros datos. Inicia una nueva generación.",
    limit: "Se alcanzó el límite de generaciones. Espera un minuto antes de intentarlo de nuevo.",
    auth: "OpenRouter rechazó la clave de API. Actualiza OPENROUTER_API_KEY y reinicia el servidor.",
    credits: "OpenRouter necesita créditos o un presupuesto mayor para la clave.",
    permissions: "OpenRouter bloqueó la solicitud. Comprueba los permisos de la clave y los ajustes del proveedor.",
    rateLimit: "OpenRouter está ocupado o alcanzó su límite de solicitudes. Espera antes de volver a generar.",
    model: "El modelo o un proveedor compatible con estos ajustes no está disponible. Elige otro modelo o su nivel de razonamiento predeterminado.",
    settings: "OpenRouter rechazó estos ajustes. Elige un nivel de razonamiento compatible o el predeterminado del modelo.",
    provider: "OpenRouter no pudo completar la solicitud. Comprueba el modelo elegido y los ajustes del proveedor.",
    budget: "El modelo agotó el presupuesto antes de responder. Reduce el nivel de razonamiento o aumenta OPENROUTER_MAX_COMPLETION_TOKENS en .env.local y reinicia el servidor.",
    empty: "El modelo no devolvió texto. Prueba otro modelo de texto configurado.",
    incomplete: "El modelo devolvió una creación incompleta. Prueba otro modelo de texto configurado.",
    unknown: "No se conoce el resultado. OpenRouter podría haber procesado la solicitud. Revisa tu actividad en OpenRouter antes de volver a generar.",
    unreadable: "No se pudo leer la respuesta de OpenRouter. Revisa tu actividad en OpenRouter antes de intentarlo de nuevo.",
    interrupted: "La solicitud se interrumpió y no se conoce el resultado. Revisa tu actividad en OpenRouter antes de volver a generar. No se reintentará automáticamente.",
  },
} satisfies Record<Locale, Record<string, string>>;

export function generationErrorMessage(run: Pick<GenerationRun, "status" | "errorCode">, locale: Locale): string {
  const errors = generationErrors[locale];
  return (run.errorCode && Object.hasOwn(errors,run.errorCode) ? errors[run.errorCode as keyof typeof errors] : undefined) || (run.status === "unknown" ? errors.unknown : errors.failed);
}

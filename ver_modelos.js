require("dotenv").config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "❌ ERROR CRÍTICO: No se encontró GEMINI_API_KEY en el archivo .env",
  );
  process.exit(1);
}

console.log("🔑 Probando clave:", apiKey.substring(0, 10) + "...");
console.log("📡 Conectando con Google para ver tus modelos disponibles...");

async function checkModels() {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    const data = await response.json();

    if (data.error) {
      console.error("❌ ERROR DE GOOGLE:", data.error.message);
      return;
    }

    console.log(
      "\n✅ ¡CONEXIÓN EXITOSA! Estos son los modelos que TU clave puede usar:",
    );
    console.log(
      "---------------------------------------------------------------",
    );

    const validos = data.models.filter((m) =>
      m.supportedGenerationMethods.includes("generateContent"),
    );

    validos.forEach((m) => {
      console.log(
        `🌟 Nombre para poner en el código: "${m.name.replace("models/", "")}"`,
      );
    });

    console.log(
      "---------------------------------------------------------------",
    );
    console.log(
      "👉 Copia uno de los nombres de arriba (ej: gemini-1.5-flash) y ponlo en tu controlador.",
    );
  } catch (error) {
    console.error("❌ Error de red:", error.message);
  }
}

checkModels();

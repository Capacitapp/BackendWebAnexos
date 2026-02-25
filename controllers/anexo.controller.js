const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");
const Anexo = require("../models/Anexo");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const PDFParser = require("pdf2json");

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const multer = require("multer");

// Configuración de almacenamiento
const storageTemplates = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "storage/templates/"),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const storageUploads = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(__dirname, "../storage/uploads");
    if (!fs.existsSync(uploadPath))
      fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, "storage/uploads/");
  },
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

exports.upload = multer({ storage: storageTemplates });
exports.uploadTecnico = multer({ storage: storageUploads }).single(
  "pdfTecnico",
);

// --- FUNCIÓN AUXILIAR PARA PDF2JSON ---
function extraerTextoPDF(rutaArchivo) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(this, 1);
    pdfParser.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError),
    );
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      const rawText = pdfParser.getRawTextContent();
      resolve(rawText);
    });
    pdfParser.loadPDF(rutaArchivo);
  });
}

// 1. Subir Plantilla
exports.subirPlantilla = (req, res) => {
  if (!req.file) return res.status(400).send("No file.");
  res.send({ message: "Plantilla subida", filename: req.file.filename });
};

// 2. Generar Manual
exports.generarAnexo = async (req, res) => {
  try {
    const templateName = req.body.nombrePlantilla || "plantilla_prueba.docx";
    const datos = req.body.datos || {};
    const templatePath = path.resolve(
      __dirname,
      "../storage/templates",
      templateName,
    );
    if (!fs.existsSync(templatePath))
      return res.status(404).json({ error: "Plantilla no encontrada" });

    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.render(datos);
    const buf = doc
      .getZip()
      .generate({ type: "nodebuffer", compression: "DEFLATE" });

    await new Anexo({
      nombrePlantilla: templateName,
      datosRellenados: datos,
      usuarioId: req.user.id, //nuevo campo para relacionar con el usuario
    }).save();

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=anexo_final.docx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.send(buf);
  } catch (error) {
    res.status(500).json({ error: "Error manual" });
  }
};

// 3. GENERACIÓN INTELIGENTE
exports.generarAnexoInteligente = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Falta subir el PDF técnico" });

    // 🔵 NUEVO: DATOS MANUALES DESDE FRONTEND
    const {
      rut_organismo,
      nombre_organismo,
      telefono_organismo,
      direccion_organismo,
      comuna_organismo,
      region_organismo,
    } = req.body;

    console.log(
      "📄 Extrayendo texto masivo con PDF2JSON:",
      req.file.originalname,
    );

    // A. LEER TEXTO LOCALMENTE
    let textoCompleto = "";
    try {
      textoCompleto = await extraerTextoPDF(req.file.path);
      console.log("✅ Texto extraído. Longitud:", textoCompleto.length);
    } catch (errPdf) {
      console.error("❌ Error leyendo PDF:", errPdf);
      return res
        .status(500)
        .json({ error: "No se pudo leer el PDF: " + errPdf });
    }

    console.log("🤖 Analizando TODO el documento con Gemini 2.5 Flash...");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // --- AQUÍ ESTÁ EL PROMPT AJUSTADO PARA PLURALES ---
    const prompt = `
Actúa como un experto técnico en licitaciones SENCE.
Tu misión es generar el "Anexo N° 2" replicando EXACTAMENTE el formato administrativo oficial SENCE.

Texto a analizar:
"${textoCompleto.substring(0, 70000)}"

================ REGLAS OBLIGATORIAS =================

1. DETECCIÓN DE PARTICIPANTES
- Detectar número total de cupos (TOTAL_PARTICIPANTES).
- Si no aparece explícitamente, buscar pistas (ej: "25 alumnos").
- Si no hay información, asumir estándar SENCE: 25.
- Usar este número para los cálculos matemáticos.

2. DETECCIÓN DE MÓDULOS
- El campo "modulo" solo puede contener números separados por coma (Ej: "1,2,3").
- Prohibido texto.

3. PROHIBIDO VALORES VACÍOS
- No usar null, undefined o "". Usar "—" si no aplica.

------------------------------------------------------
4. REGLAS DE FORMATO (CANTIDAD Y UNIDAD) - ¡CRÍTICO!
------------------------------------------------------
Debes separar estrictamente el número del texto y APLICAR PLURALES CORRECTAMENTE.

A) CAMPO "cantidad":
   - DEBE ser SOLO NÚMEROS (String numérico).
   - Ejemplo: "25", "1", "10".
   - PROHIBIDO poner texto aquí.

B) CAMPO "unidad_medida":
   - DEBE coincidir gramaticalmente con la cantidad.
   - Si cantidad = "1" -> Usar SINGULAR (ej: "Unidad", "Set", "Caja", "Resma").
   - Si cantidad > "1" -> Usar PLURAL (ej: "Unidades", "Sets", "Cajas", "Resmas").
   
   Ejemplos correctos:
   - "25 Unidades" (Separado en json: cantidad="25", unidad_medida="Unidades")
   - "1 Unidad" (Separado en json: cantidad="1", unidad_medida="Unidad")
   - "25 Sets" (Separado en json: cantidad="25", unidad_medida="Sets")

------------------------------------------------------
5. TABLA 7 – EQUIPOS (LÓGICA MATEMÁTICA)
------------------------------------------------------
Calcula la "cantidad" basándote en el uso:

Caso A: Equipo Individual (ej: PC Alumno)
   - cantidad = TOTAL_PARTICIPANTES
   - unidad_medida = "Unidades"
   - num_participantes = "1"

Caso B: Equipo de Sala/Facilitador (ej: Proyector, PC Profesor)
   - cantidad = "1"
   - unidad_medida = "Unidad"
   - num_participantes = TOTAL_PARTICIPANTES

*Antigüedad*: "Menos de 2 años" para tecnología.
*Certificación*: Solo si el texto dice explícitamente "SEC", sino "No aplica".

------------------------------------------------------
6. TABLA 8 – MATERIALES (LÓGICA MATEMÁTICA)
------------------------------------------------------

Caso A: Insumo Individual (ej: Cuaderno, Lápiz)
   - cantidad = TOTAL_PARTICIPANTES
   - unidad_medida = "Unidades"
   - num_participantes = "1"

Caso B: Sets o Kits (ej: Estuche con útiles)
   - cantidad = TOTAL_PARTICIPANTES
   - unidad_medida = "Sets"
   - num_participantes = "1"

Caso C: Insumos por Paquete Compartido (ej: Resmas)
   - cantidad = "2" (o lo que indique el texto)
   - unidad_medida = "Resmas"
   - num_participantes = TOTAL_PARTICIPANTES

Caso D: Insumo Grupal Único (ej: Libro de Clases)
   - cantidad = "1"
   - unidad_medida = "Unidad"
   - num_participantes = TOTAL_PARTICIPANTES

------------------------------------------------------
7. DURACIÓN
------------------------------------------------------
Extraer horas_totales, dias, meses. Si no aplica, usar "—".

======================================================
ESTRUCTURA JSON EXACTA
======================================================
Responder SOLO con este JSON válido:

{
  "nombre_curso": "...",
  "horas_totales": "...",
  "dias": "...",
  "meses": "...",
  "lista_equipos": [
    {
      "descripcion": "...",
      "modulo": "...",
      "cantidad": "...", 
      "unidad_medida": "...", 
      "num_participantes": "...",
      "antiguedad": "...",
      "certificacion": "..."
    }
  ],
  "lista_materiales": [
    {
      "descripcion": "...",
      "cantidad": "...",
      "unidad_medida": "...",
      "modulo": "...",
      "num_participantes": "..."
    }
  ],
  "objetivo_general": "...",
  "contenidos_resumen": "...",
  "infraestructura_sala": "...",
  "infraestructura_taller": "...",
  "metodologia": "...",
  "mecanismos_evaluacion": "..."
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let textoLimpio = response
      .text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let datosExtraidos;
    try {
      datosExtraidos = JSON.parse(textoLimpio);
    } catch (e) {
      console.error("JSON inválido de IA:", textoLimpio);
      return res
        .status(500)
        .json({ error: "La IA respondió pero no en formato JSON válido." });
    }

    // --- BLOQUE DATOS FINALES OPTIMIZADO ---
    const datosFinales = {
      // 1. Esparcimos primero lo que trajo la IA
      ...datosExtraidos,

      // 2. Datos manuales que vienen del frontend
      nombre_ejecutor: nombre_organismo,
      rut_ejecutor: rut_organismo,
      telefono_ejecutor: telefono_organismo,
      direccion_ejecutor: direccion_organismo,
      comuna_ejecutor: comuna_organismo,
      region_ejecutor: region_organismo,
      entidad_requirente: req.body.entidad_requirente || "—",
      codigo_curso: req.body.codigo_curso || "—",

      // 3. Aseguramos los campos de la Tabla 3 (Duración)
      horas: datosExtraidos.horas_totales || "—",
      dias: datosExtraidos.dias || "—",
      meses: datosExtraidos.meses || "—",

      // 4. Campos de texto largo
      contenidos: datosExtraidos.contenidos_resumen || "—",
      objetivo_general: datosExtraidos.objetivo_general || "—",
      metodologia: datosExtraidos.metodologia || "—",
      mecanismos_evaluacion: datosExtraidos.mecanismos_evaluacion || "—",
    };
    console.log("✅ Datos extraídos (Ejemplo):", datosExtraidos.nombre_curso);

    try {
      await new Anexo({
        nombrePlantilla: "plantilla_anexo2.docx",
        datosRellenados: datosFinales,
        fechaGeneracion: new Date(),
        usuarioId: req.user.id,
      }).save();

      console.log("✅ GUARDADO EXITOSO EN BD");
      res.setHeader("X-Anexo-Guardado", "true");
    } catch (dbError) {
      console.error("❌ ERROR AL GUARDAR EN BD:", dbError);
      res.setHeader("X-Anexo-Guardado", "false");
    }

    // Header para el frontend
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Anexo-Guardado, Content-Disposition",
    );

    // C. RELLENAR WORD
    const templatePath = path.resolve(
      __dirname,
      "../storage/templates",
      "plantilla_anexo2.docx",
    );
    if (!fs.existsSync(templatePath))
      return res.status(500).json({ error: "Falta plantilla_anexo2.docx" });

    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);

    // Configuración para que los saltos de línea en el JSON se vean en el Word
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter(part) {
        if (!part.value) {
          return "";
        }
        return part.value;
      },
    });

    doc.render(datosFinales);
    const buf = doc
      .getZip()
      .generate({ type: "nodebuffer", compression: "DEFLATE" });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Anexo_IA_Completo.docx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.send(buf);

    fs.unlinkSync(req.file.path);
  } catch (error) {
    console.error("❌ Error General:", error);
    res.status(500).json({ error: "Error: " + error.message });
  }
};

// 4. Get a todos los anexos
exports.obtenerAnexos = async (req, res) => {
  try {
    const anexos = await Anexo.find({ usuarioId: req.user.id }).sort({
      createdAt: -1,
    });
    res.status(200).json(anexos);
  } catch (error) {
    console.error("❌ Error obteniendo anexos:", error);
    res.status(500).json({ error: "Error al obtener anexos" });
  }
};

// 5. Get anexo por ID
exports.obtenerAnexoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const anexo = await Anexo.findOne({
      _id: id,
      usuarioId: req.user.id,
    });

    if (!anexo) {
      return res.status(404).json({ error: "Anexo no encontrado" });
    }

    res.status(200).json(anexo);
  } catch (error) {
    console.error("❌ Error obteniendo anexo:", error);
    res.status(500).json({ error: "Error al obtener el anexo" });
  }
};

// 6. Actualizar Anexo por ID
exports.actualizarAnexo = async (req, res) => {
  try {
    const { id } = req.params;

    const anexoActualizado = await Anexo.findOneAndUpdate(
      { _id: id, usuarioId: req.user.id },
      req.body,
      { new: true },
    );

    if (!anexoActualizado) {
      return res.status(404).json({ error: "Anexo no encontrado" });
    }

    res.status(200).json({
      message: "Anexo actualizado correctamente",
      data: anexoActualizado,
    });
  } catch (error) {
    console.error("❌ Error actualizando anexo:", error);
    res.status(500).json({ error: "Error al actualizar el anexo" });
  }
};

// 7. ELIMINAR ANEXO
exports.eliminarAnexo = async (req, res) => {
  try {
    const { id } = req.params;

    const anexoEliminado = await Anexo.findOneAndDelete({
      _id: id,
      usuarioId: req.user.id,
    });

    if (!anexoEliminado) {
      return res.status(404).json({ error: "Anexo no encontrado" });
    }

    res.status(200).json({
      message: "Anexo eliminado correctamente",
    });
  } catch (error) {
    console.error("❌ Error eliminando anexo:", error);
    res.status(500).json({ error: "Error al eliminar el anexo" });
  }
};
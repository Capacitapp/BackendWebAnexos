const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  // 1. Leer el token del header
  const token = req.header("x-auth-token") || req.header("Authorization");

  // 2. Revisar si no hay token
  if (!token) {
    return res.status(401).json({ message: "Acceso denegado. No hay token." });
  }

  try {
    // Si el token viene como "Bearer eyJhbGci...", limpiamos el "Bearer "
    const tokenLimpio = token.replace("Bearer ", "");

    // 3. Verificar el token
    const decoded = jwt.verify(tokenLimpio, process.env.JWT_SECRET);

    // 4. Guardar el usuario decodificado en la petición
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token no válido" });
  }
};
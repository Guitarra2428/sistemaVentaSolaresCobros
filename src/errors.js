class AppError extends Error {
  constructor(message, status = 400, code = "APP_ERROR", details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "No autenticado") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Operación no permitida para este usuario") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

module.exports = { AppError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError };

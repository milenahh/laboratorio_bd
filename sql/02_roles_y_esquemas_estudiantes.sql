-- Crea los roles est01..est35, les concede el rol lab_app (usado por la aplicación)
-- y genera los esquemas de cada estudiante. Ejecutar como administrador, una sola vez.
-- Requisito: el rol lab_app ya existe y 01_crear_esquema_estudiante.sql está cargado.

DO $$
DECLARE
  i int;
  r text;
BEGIN
  FOR i IN 1..35 LOOP
    r := 'est' || lpad(i::text, 2, '0');
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
    EXECUTE format('GRANT %I TO lab_app WITH INHERIT FALSE', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION lab_crear_esquema(text) TO lab_app');
    PERFORM lab_crear_esquema(r);
  END LOOP;
END;
$$;

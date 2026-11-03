-- Crea (o reinicia) el esquema de trabajo de un estudiante: tablas cliente y pedido con datos.
-- Una sola base: todos los esquemas estNN viven en la misma base de datos.
-- Uso: SELECT lab_crear_esquema('est01');

CREATE OR REPLACE FUNCTION lab_crear_esquema(p_schema text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_schema !~ '^est(0[1-9]|1[0-9]|20)$' THEN
    RAISE EXCEPTION 'código de esquema no válido';
  END IF;

  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', p_schema);
  EXECUTE format('CREATE SCHEMA %I', p_schema);

  EXECUTE format('CREATE TABLE %I.cliente (id int PRIMARY KEY, nombre text, ciudad text)', p_schema);
  EXECUTE format($q$
    INSERT INTO %I.cliente (id, nombre, ciudad)
    SELECT g, 'Cliente ' || g, (ARRAY['Bogotá','Medellín','Cali','Barranquilla','Cartagena'])[1 + g %% 5]
    FROM generate_series(1, 10000) AS g
  $q$, p_schema);

  EXECUTE format('CREATE TABLE %I.pedido (id int PRIMARY KEY, cliente_id int REFERENCES %I.cliente(id), fecha date, total numeric(10,2))', p_schema, p_schema);
  EXECUTE format($q$
    INSERT INTO %I.pedido (id, cliente_id, fecha, total)
    SELECT g, 1 + (g * 7) %% 10000, date '2025-01-01' + (g %% 365), ((g %% 500) + 10.5)::numeric(10,2)
    FROM generate_series(1, 200000) AS g
  $q$, p_schema);

  EXECUTE format('ANALYZE %I.cliente', p_schema);
  EXECUTE format('ANALYZE %I.pedido', p_schema);
END;
$$;

DO $$
BEGIN
  FOR i IN 1..20 LOOP
    PERFORM lab_crear_esquema('est' || lpad(i::text, 2, '0'));
  END LOOP;
END;
$$;

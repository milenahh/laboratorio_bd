-- Crea (o reinicia) el esquema de trabajo de un estudiante con las tablas cliente y pedido.
-- El esquema y sus tablas quedan propiedad del rol estNN; el resto de roles no tiene acceso.
-- Uso (admin): SELECT lab_crear_esquema('est01');
-- Uso (aplicación): la app llama esta función con el código de estudiante validado.

CREATE OR REPLACE FUNCTION lab_crear_esquema(p_schema text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_schema !~ '^est(0[1-9]|[12][0-9]|3[0-5])$' THEN
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

  -- Propiedad al rol del estudiante: puede crear/borrar índices y modificar datos solo aquí.
  EXECUTE format('ALTER TABLE %I.cliente OWNER TO %I', p_schema, p_schema);
  EXECUTE format('ALTER TABLE %I.pedido OWNER TO %I', p_schema, p_schema);
  EXECUTE format('ALTER SCHEMA %I OWNER TO %I', p_schema, p_schema);
END;
$$;

REVOKE ALL ON FUNCTION lab_crear_esquema(text) FROM PUBLIC;

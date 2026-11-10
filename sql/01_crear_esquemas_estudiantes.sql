-- Restaura las tablas base (cliente y pedido) del esquema de un estudiante.
-- El esquema no se borra: así se conservan las tablas que el estudiante crea en su taller.
-- Uso (como jpmfbzox, base jpmfbzox_laboratorio): SELECT lab_crear_esquema('est01');
-- La app llama esta función desde «Restablecer mis datos».

CREATE OR REPLACE FUNCTION lab_crear_esquema(p_schema text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_schema !~ '^est(0[1-9]|[12][0-9]|30)$' THEN
    RAISE EXCEPTION 'código de esquema no válido';
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO jpmfbzox_admin', p_schema);

  EXECUTE format('DROP TABLE IF EXISTS %I.pedido', p_schema);
  EXECUTE format('DROP TABLE IF EXISTS %I.cliente', p_schema);

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

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON %I.cliente, %I.pedido TO jpmfbzox_admin', p_schema, p_schema);

  EXECUTE format('ANALYZE %I.cliente', p_schema);
  EXECUTE format('ANALYZE %I.pedido', p_schema);
END;
$$;

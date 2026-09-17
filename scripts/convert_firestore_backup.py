#!/usr/bin/env python3
"""Converte o JSON bruto da API REST do Firestore (formato tipado, com
fields/stringValue/arrayValue/...) para o mesmo formato plano que o botão
"Exportar" do site gera — assim o backup automático pode ser importado
direto pela tela "Importar" da própria agenda.

Uso: convert_firestore_backup.py <entrada.json> <saida.json>
"""
import json
import sys


def decode_value(v):
    if v is None or 'nullValue' in v:
        return None
    if 'booleanValue' in v:
        return v['booleanValue']
    if 'integerValue' in v:
        return int(v['integerValue'])
    if 'doubleValue' in v:
        return v['doubleValue']
    if 'stringValue' in v:
        return v['stringValue']
    if 'timestampValue' in v:
        return v['timestampValue']
    if 'arrayValue' in v:
        return [decode_value(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return decode_fields(v['mapValue'].get('fields', {}))
    return None


def decode_fields(fields):
    return {k: decode_value(v) for k, v in fields.items()}


def main():
    if len(sys.argv) != 3:
        print('Uso: convert_firestore_backup.py <entrada.json> <saida.json>', file=sys.stderr)
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]
    with open(src, 'r', encoding='utf-8') as f:
        raw = json.load(f)

    if 'fields' not in raw:
        print('Resposta inesperada da API do Firestore (sem "fields"):', file=sys.stderr)
        print(json.dumps(raw, ensure_ascii=False)[:2000], file=sys.stderr)
        sys.exit(1)

    plain = decode_fields(raw['fields'])
    plain.pop('_rev', None)

    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(plain, f, ensure_ascii=False, indent=2)

    print(f'Backup convertido: {dst}')
    print(f'  disciplinas: {len(plain.get("disciplinas", []))}')
    print(f'  trabalhos:   {len(plain.get("trabalhos", []))}')
    print(f'  horarios:    {len(plain.get("horarios", []))}')


if __name__ == '__main__':
    main()

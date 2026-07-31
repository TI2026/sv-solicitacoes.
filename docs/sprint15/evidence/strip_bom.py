import glob

for f in glob.glob('supabase/migrations/*.sql'):
    with open(f, 'rb') as fr:
        content = fr.read()
    if content.startswith(b'\xef\xbb\xbf'):
        with open(f, 'wb') as fw:
            fw.write(content[3:])

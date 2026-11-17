const stage = process.argv[2] ?? 'requested';
process.stderr.write(`${stage} browser checks are introduced in the corresponding UI stage.\n`);
process.exitCode = 2;

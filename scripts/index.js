const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { NFTStorage } = require('nft.storage');
const { readFileSync, writeFileSync, writeFile, renameSync, readdirSync, statSync } = require('fs');
const { filesFromPaths } = require('files-from-path');

const program = new Command();

program.version('0.0.1')
  .name('profiles-util')
  .description('Profiles utility');

program.command('extract')
  .description('Extract profiles from issue')
  .argument('<string>', 'Issue body to extract from')
  .action(extractIssue);

program.command('add-applicant')
  .description('Add new applicant')
  .argument('<string>', 'Issue body')
  .action(addProfile);

program.command('upload')
  .description('Upload data to ipfs')
  .action(uploadToIPFS);

program.parse();


function extractIssue(issueBody) {
  const profiles = {};
  issueBody.split('\n').forEach(line => {
    const [key, value] = line.split(':');
    profiles[key.trim()] = value.trim();
  })
  console.log(profiles);
  return profiles;
}

function addProfile(issueBody) {
  const profile = extractIssue(issueBody);
  const picturesDir = 'pictures';
  const targetDir = 'selected_pictures';
  const id = profile['Picture'];
  const file = id + '.png'

  selectPicture(file, picturesDir, targetDir);
  updateMetadata(profile, 'profiles');
  appendRecord(id, 'release.md');
}

async function uploadToIPFS() {
  const NFT_STORAGE_TOKEN = process.env.NFT_STORAGE_TOKEN;
  if (!NFT_STORAGE_TOKEN) {
    console.log('NFT_STORAGE_TOKEN is not set');
    return;
  };

  // Upload pictures to ipfs
  const client = new NFTStorage({ token: NFT_STORAGE_TOKEN });
  const pictureDir = await filesFromPaths(['selected_pictures'], {
    pathPrefix: path.resolve('selected_pictures'),
    hidden: true,
  })
  const picCid = await client.storeDirectory(pictureDir);
  console.log(picCid);

  // Find metadata files needed to be updated
  const release = readFileSync('release.md', 'utf8');
  const targetFiles = release.trim().split('\n').map(id => id + '.json');
  console.log("targetFiles: ", targetFiles);

  // Update ipfs address of relevant metadata 
  updatePictureOfMetadata(picCid, 'profiles', targetFiles);
  const metadataDir = await filesFromPaths(['profiles'], {
    pathPrefix: path.resolve('profiles'),
    hidden: true,
  })

  // Upload metadata to ipfs
  const metadataCid = await client.storeDirectory(metadataDir)
  console.log(metadataCid);
}

function appendRecord(id, targetFile) {
  let data = readFileSync(targetFile, 'utf8');
  const newData = data.length === 0 ? id : data.trim() + '\n' + id;
  writeFileSync(targetFile, newData, 'utf8');
  console.log('New applicant written to release.md');
}

function updateMetadata(profile, targetDir) {
  const meta = {
    "name": "Darwinia Community DAO Profile #0",
    "description": "",
    "image": "ipfs://{dir_cid}/uuid",
    "external_url": "",
    "attributes": []
  };
  ["Nickname", "Role"].forEach(
    key => {
      meta['attributes'].push(
        { "trait_type": key, "value": profile[key] }
      )
    }
  );
  console.log(meta);
  const target = path.join(targetDir, profile['Picture'] + '.json');

  writeFile(target, JSON.stringify(meta, null, 2), (err) => {
    if (err) throw err;
    console.log('Data written to file');
  });
}

function updatePictureOfMetadata(cid, directoryPath, targetFiles) {
  targetFiles.forEach((filename) => {
    const filePath = path.join(directoryPath, filename);

    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.log('Error reading file:', err);
        return;
      }

      const jsonData = JSON.parse(data);
      jsonData.image = jsonData.image.replace('uuid', filename.replace('.json', '.png'));
      jsonData.image = jsonData.image.replace('{dir_cid}', cid);

      const updatedData = JSON.stringify(jsonData, null, 2);

      fs.writeFile(filePath, updatedData, 'utf8', (err) => {
        if (err) {
          console.log('Error writing file:', err);
          return;
        }

        console.log(`File ${filePath} updated`);
      });
    });
  });
}

function selectPicture(file, sourceDir, targetDir) {
  const filePath = findFile(sourceDir, file);
  if (filePath) {
    const targetPath = path.join(targetDir, file);
    renameSync(filePath, targetPath);
    console.log(`Moved ${filePath} to ${targetPath}`);
  } else {
    console.log('File not found');
  }
}

function findFile(dir, targetFileName) {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = statSync(filePath);
    if (stat.isFile() && file === targetFileName) {
      return filePath;
    }
  }
  return null;
}

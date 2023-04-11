const { Command } = require('commander');
const path = require('path');
const fs = require('fs/promises');
const { NFTStorage } = require('nft.storage');
const { filesFromPaths } = require('files-from-path');

const FILE_NOT_FOUND = "FileNotFound";
const INVALID_ISSUE_BODY = "InvalidIssueBody";

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


// Adds a profile to the repository
// Takes the body of an issue as input and extracts the profile
// The profile is then added to the profiles directory
// The profile picture is added to the selected_images directory
// The profile id is added to the release.md file
async function addProfile(issueBody) {
  const profile = extractIssue(issueBody);
  const imagesDir = 'images';
  const targetDir = 'selected_images';
  const id = profile['Picture'];
  const address = profile['Address'];
  const file = id + '.png'

  await selectPicture(file, imagesDir, targetDir);
  await updateMetadata(profile, 'profiles');
  await appendRecord(address, id, 'release.md');
}

// Uploads selected_images and profiles to IPFS and log the hash of the file.
async function uploadToIPFS() {
  const NFT_STORAGE_TOKEN = process.env.NFT_STORAGE_TOKEN;
  if (!NFT_STORAGE_TOKEN) {
    console.log('NFT_STORAGE_TOKEN is not set');
    return;
  };

  // Upload images to ipfs
  const client = new NFTStorage({ token: NFT_STORAGE_TOKEN });
  const pictureDir = await filesFromPaths(['selected_images'], {
    pathPrefix: path.resolve('selected_images'),
    hidden: true,
  })
  const picCid = await client.storeDirectory(pictureDir);
  console.log(picCid);

  // Find metadata files needed to be updated
  const release = await fs.readFile('release.md', 'utf8');
  const targetFiles = release.trim().split('\n').map(line => line.split(',')[1]);
  console.log("targetFiles: ", targetFiles);

  // Update ipfs address of relevant metadata 
  await updatePictureOfMetadata(picCid, 'profiles', targetFiles);
  const metadataDir = await filesFromPaths(['profiles'], {
    pathPrefix: path.resolve('profiles'),
    hidden: true,
  })

  // Upload metadata to ipfs
  const metadataCid = await client.storeDirectory(metadataDir)
  console.log(metadataCid);
}

function extractIssue(issueBody) {
  const profiles = {};
  const regex = /###\s+(\w+)\s+(.+)\s+/gm;
  let match;
  while ((match = regex.exec(issueBody)) !== null) {
    const [, label, value] = match;
    if (["Nickname", "Role", "Picture", "Address"].indexOf(label) == -1) {
      continue;
    }
    profiles[label] = value.trim();
  }
  console.log(profiles);
  if (!('Nickname' in profiles) || !('Role' in profiles) || !('Picture' in profiles) || !('Address' in profiles)) {
    throw INVALID_ISSUE_BODY;
  };

  return profiles;
}

async function appendRecord(address, id, targetFile) {
  let data = await fs.readFile(targetFile, 'utf8');
  const line = address + ',' + id;
  const newData = data.length === 0 ? line : data.trim() + '\n' + line;
  await fs.writeFile(targetFile, newData, 'utf8');
  console.log('New applicant written to release.md');
}

async function updateMetadata(profile, targetDir) {
  const meta = {
    "name": "Darwinia Community DAO Profile",
    "user_id": "",
    "description": "",
    "image": "ipfs://{dir_cid}/uuid",
    // "external_url": "",
    "attributes": [
      {
        "trait_type": "Version",
        "value": "0"
      },
    ]
  };
  ["Nickname", "Role", "Saying"].forEach(
    key => {
      meta['attributes'].push(
        { "trait_type": key, "value": profile[key] ? profile[key] : "" }
      )
    }
  );
  meta['user_id'] = profile['Picture'];
  console.log(meta);
  const target = path.join(targetDir, profile['Picture']);

  await fs.writeFile(target, JSON.stringify(meta, null, 2));
  console.log('Data written to file');
}

// This function takes a CID, directory path, and an array of target files as
// parameters. It reads the contents of each file, parses the JSON data, replaces
// the placeholder UUID with the actual filename (minus the .json extension), and
// replaces the placeholder directory CID with the actual CID. Finally, it writes
// the updated data back to the file.
async function updatePictureOfMetadata(cid, directoryPath, targetFiles) {
  for (const filename of targetFiles) {
    const filePath = path.join(directoryPath, filename);
    data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    jsonData.image = jsonData.image.replace('uuid', filename + '.png');
    jsonData.image = jsonData.image.replace('{dir_cid}', cid);
    const updatedData = JSON.stringify(jsonData, null, 2);
    await fs.writeFile(filePath, updatedData, 'utf8');
    console.log(`File ${filePath} updated`);
  };
}

async function selectPicture(file, sourceDir, targetDir) {
  const filePath = await findFile(sourceDir, file);
  if (filePath) {
    const targetPath = path.join(targetDir, file);
    await fs.rename(filePath, targetPath);
    console.log(`Moved ${filePath} to ${targetPath}`);
  } else {
    console.error('File not found:', file);
    throw FILE_NOT_FOUND
  }
}

async function findFile(dir, targetFileName) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isFile() && file === targetFileName) {
      return filePath;
    }
  }
  return null;
}

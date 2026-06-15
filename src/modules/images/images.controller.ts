import {
  Controller,
  Delete,
  FileTypeValidator,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImagesService, type UploadableFile } from './images.service';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES }),
          new FileTypeValidator({ fileType: /^image\// }),
        ],
      }),
    )
    file: UploadableFile,
  ): Promise<{ id: string; url: string }> {
    const image = await this.imagesService.upload(file);
    return { id: image.id, url: image.url };
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.imagesService.remove(id);
    return { message: 'Imagen eliminada correctamente' };
  }
}

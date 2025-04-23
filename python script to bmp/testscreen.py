import numpy as np
from PIL import Image
import re
import sys

def parse_coordinates(coord_text):
    """
    Parse coordinates from text in the format:
    [x,y],
    [x,y]
    etc.
    
    Returns a list of (x, y) tuples.
    """
    # Find all patterns matching [x,y]
    pattern = r'\[(\d+),(\d+)\]'
    matches = re.findall(pattern, coord_text)
    
    # Convert matches to integer tuples
    coordinates = [(int(x), int(y)) for x, y in matches]
    return coordinates

def create_bmp_from_coordinates(coordinates, padding=10, point_size=3, bg_color=(255, 255, 255), point_color=(0, 0, 0)):
    """
    Create a BMP image from coordinates.
    
    Args:
        coordinates: List of (x, y) coordinate tuples
        padding: Extra space around the edges
        point_size: Size of each point
        bg_color: Background color as RGB tuple
        point_color: Point color as RGB tuple
        
    Returns:
        PIL Image object
    """
    if not coordinates:
        raise ValueError("No coordinates provided")
    
    # Find the dimensions needed for the image
    min_x = min(coord[0] for coord in coordinates)
    max_x = max(coord[0] for coord in coordinates)
    min_y = min(coord[1] for coord in coordinates)
    max_y = max(coord[1] for coord in coordinates)
    
    # Calculate image dimensions with padding
    width = max_x - min_x + 1 + (2 * padding)
    height = max_y - min_y + 1 + (2 * padding)
    
    # Create a blank image
    img = Image.new('RGB', (width, height), bg_color)
    pixels = img.load()
    
    # Plot each coordinate
    for x, y in coordinates:
        # Adjust coordinates to account for padding and minimum values
        adjusted_x = x - min_x + padding
        adjusted_y = y - min_y + padding
        
        # Draw the point as a small square
        for dx in range(-point_size//2, point_size//2 + 1):
            for dy in range(-point_size//2, point_size//2 + 1):
                px = adjusted_x + dx
                py = adjusted_y + dy
                if 0 <= px < width and 0 <= py < height:
                    pixels[px, py] = point_color
    
    return img

def main():
    # Example usage
    if len(sys.argv) > 1:
        # Read from file if filename provided
        with open(sys.argv[1], 'r') as f:
            coord_text = f.read()
    else:
        # Example coordinates
        coord_text = """[10,10],
                        [20,20],
                        [30,10],
                        [40,40],
                        [50,20]"""
        print("No input file provided. Using example coordinates:")
        print(coord_text)
    
    coordinates = parse_coordinates(coord_text)
    print(f"Parsed {len(coordinates)} coordinates")
    
    img = create_bmp_from_coordinates(coordinates)
    
    output_filename = "coordinates.bmp"
    img.save(output_filename)
    print(f"Image saved as {output_filename}")

if __name__ == "__main__":
    main()